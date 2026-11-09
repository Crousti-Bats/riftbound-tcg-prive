// PWA (étape 9) : génération du service worker, stratégies de cache, manifeste et icônes.
// Le service worker est exécuté dans un bac à sable (node:vm) avec de faux caches et un faux réseau.
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { construireServiceWorker, FICHIERS_STATIQUES_A_PRECHARGER } from "../../configuration/plugin-service-worker";

const RACINE_PROJET = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const racine = (relatif: string) => resolve(RACINE_PROJET, relatif);
const MODELE = readFileSync(racine("application-web/service-worker/modele-service-worker.js"), "utf8");
const STATIQUES = racine("application-web/fichiers-statiques");
const ORIGINE = "https://riftbound-tcg.exemple.dev";
const FICHIERS_BUILD = ["/assets/index-abc123.js", "/assets/index-def456.css"];

// ---------- Faux environnement de service worker ----------

interface FausseRequete {
  method: string;
  url: string;
  mode: string;
}

const absolue = (cle: string | FausseRequete) => new URL(typeof cle === "string" ? cle : cle.url, ORIGINE).href;

/** Réponse « réseau » de notre origine (type basic, comme dans un vrai navigateur). */
function reponseReseau(corps: string, statut = 200): Response {
  const reponse = new Response(corps, { status: statut });
  Object.defineProperty(reponse, "type", { value: "basic" });
  return reponse;
}

class FauxCache {
  readonly entrees = new Map<string, Response>();
  constructor(private readonly reseau: (url: string) => Promise<Response>) {}
  async addAll(urls: string[]) {
    for (const url of urls) this.entrees.set(absolue(url), await this.reseau(absolue(url)));
  }
  async put(cle: string | FausseRequete, reponse: Response) {
    this.entrees.set(absolue(cle), reponse);
  }
  async match(cle: string | FausseRequete) {
    return this.entrees.get(absolue(cle))?.clone();
  }
}

function demarrerServiceWorker(options: { reseauCoupe?: boolean } = {}) {
  const etat = { reseauCoupe: options.reseauCoupe ?? false };
  const reseau = vi.fn(async (url: string) => {
    if (etat.reseauCoupe) throw new TypeError("Failed to fetch");
    return reponseReseau(`réseau:${new URL(url).pathname}`);
  });
  const caches = new Map<string, FauxCache>();
  const fauxCaches = {
    open: async (nom: string) => {
      if (!caches.has(nom)) caches.set(nom, new FauxCache(reseau));
      return caches.get(nom)!;
    },
    keys: async () => [...caches.keys()],
    delete: async (nom: string) => caches.delete(nom),
  };
  const ecouteurs = new Map<string, (evenement: unknown) => void>();
  const self = {
    location: { origin: ORIGINE },
    addEventListener: (type: string, f: (evenement: unknown) => void) => ecouteurs.set(type, f),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const code = construireServiceWorker(MODELE, FICHIERS_BUILD);
  vm.runInNewContext(code, {
    self,
    caches: fauxCaches,
    fetch: (requete: string | FausseRequete) => reseau(absolue(requete)),
    URL,
    Response,
  });

  async function cycleDeVie(type: "install" | "activate") {
    const attentes: Promise<unknown>[] = [];
    ecouteurs.get(type)!({ waitUntil: (p: Promise<unknown>) => attentes.push(p) });
    await Promise.all(attentes);
  }

  /** Simule une requête de la page. Renvoie null si le service worker la laisse passer. */
  async function requete(chemin: string, init: { method?: string; mode?: string } = {}): Promise<Response | null> {
    let reponse: Promise<Response> | null = null;
    ecouteurs.get("fetch")!({
      request: { method: init.method ?? "GET", url: new URL(chemin, ORIGINE).href, mode: init.mode ?? "cors" },
      respondWith: (p: Promise<Response>) => (reponse = p),
    });
    return reponse ? await reponse : null;
  }

  return { etat, reseau, caches, self, cycleDeVie, requete };
}

// ---------- Génération ----------

describe("PWA - génération du service worker", () => {
  it("injecte la coquille, les fichiers statiques et ceux du build, sans laisser de marqueur", () => {
    const code = construireServiceWorker(MODELE, FICHIERS_BUILD);
    expect(code).not.toContain("__FICHIERS_A_PRECHARGER__");
    expect(code).not.toContain("__VERSION__");
    const liste = JSON.parse(/FICHIERS_A_PRECHARGER = (\[.*?\]);/.exec(code)![1]!) as string[];
    expect(liste).toEqual(["/", ...FICHIERS_STATIQUES_A_PRECHARGER, ...[...FICHIERS_BUILD].sort()]);
  });

  it("change de version quand le build change, et seulement dans ce cas", () => {
    const version = (fichiers: string[]) => /const VERSION = "([0-9a-f]{12})"/.exec(construireServiceWorker(MODELE, fichiers))![1];
    expect(version(FICHIERS_BUILD)).toBe(version([...FICHIERS_BUILD].reverse()));
    expect(version(FICHIERS_BUILD)).not.toBe(version(["/assets/index-zzz999.js"]));
  });

  it("refuse un modèle sans marqueurs (on ne déploie jamais un service worker vide)", () => {
    expect(() => construireServiceWorker("console.log(1)", FICHIERS_BUILD)).toThrow(/marqueur/);
  });

  it("les fichiers statiques préchargés existent vraiment", () => {
    for (const chemin of FICHIERS_STATIQUES_A_PRECHARGER) expect(existsSync(`${STATIQUES}${chemin}`), chemin).toBe(true);
  });
});

// ---------- Stratégies de cache ----------

describe("PWA - service worker", () => {
  it("installation : précharge la coquille et les fichiers, puis s'active sans attendre", async () => {
    const sw = demarrerServiceWorker();
    await sw.cycleDeVie("install");
    const [nom, cache] = [...sw.caches.entries()][0]!;
    expect(nom).toMatch(/^riftbound-[0-9a-f]{12}$/);
    expect([...cache.entrees.keys()]).toContain(`${ORIGINE}/`);
    expect([...cache.entrees.keys()]).toContain(`${ORIGINE}/assets/index-abc123.js`);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it("activation : supprime les anciennes versions, garde les caches d'autres origines", async () => {
    const sw = demarrerServiceWorker();
    await sw.cycleDeVie("install");
    sw.caches.set("riftbound-ancienne", new FauxCache(sw.reseau));
    sw.caches.set("autre-chose", new FauxCache(sw.reseau));
    await sw.cycleDeVie("activate");
    expect([...sw.caches.keys()].filter((n) => n.startsWith("riftbound-"))).toHaveLength(1);
    expect(sw.caches.has("autre-chose")).toBe(true);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  it("SÉCURITÉ : ne touche jamais à l'API, aux requêtes POST ni aux autres sites", async () => {
    const sw = demarrerServiceWorker();
    await sw.cycleDeVie("install");
    expect(await sw.requete("/api/collection")).toBeNull();
    expect(await sw.requete("/api/auth/moi")).toBeNull();
    expect(await sw.requete("/api/boosters/ouvrir", { method: "POST" })).toBeNull();
    expect(await sw.requete("/", { method: "POST", mode: "navigate" })).toBeNull();
    expect(await sw.requete("https://cmsassets.rgpub.io/carte.png?w=300")).toBeNull();
    // Rien de l'API n'a été mis en cache.
    for (const cache of sw.caches.values()) expect([...cache.entrees.keys()].some((u) => u.includes("/api/"))).toBe(false);
  });

  it("pages : réseau d'abord, et la coquille est rafraîchie", async () => {
    const sw = demarrerServiceWorker();
    await sw.cycleDeVie("install");
    const reponse = await sw.requete("/collection", { mode: "navigate" });
    expect(await reponse!.text()).toBe("réseau:/collection");
    const cache = [...sw.caches.values()][0]!;
    expect(await (await cache.match("/"))!.text()).toBe("réseau:/collection");
  });

  it("pages hors ligne : sert la coquille de l'application, quelle que soit l'adresse", async () => {
    const sw = demarrerServiceWorker();
    await sw.cycleDeVie("install");
    sw.etat.reseauCoupe = true;
    const reponse = await sw.requete("/echanges", { mode: "navigate" });
    expect(reponse!.status).toBe(200);
    expect(await reponse!.text()).toBe("réseau:/");
  });

  it("une erreur du serveur ne remplace pas la coquille en cache", async () => {
    const sw = demarrerServiceWorker();
    await sw.cycleDeVie("install");
    sw.reseau.mockResolvedValueOnce(reponseReseau("panne", 500));
    expect((await sw.requete("/", { mode: "navigate" }))!.status).toBe(500);
    const cache = [...sw.caches.values()][0]!;
    expect(await (await cache.match("/"))!.text()).toBe("réseau:/");
  });

  it("/assets/ : cache d'abord (fichiers immuables), sans appel réseau", async () => {
    const sw = demarrerServiceWorker();
    await sw.cycleDeVie("install");
    sw.reseau.mockClear();
    const reponse = await sw.requete("/assets/index-abc123.js");
    expect(await reponse!.text()).toBe("réseau:/assets/index-abc123.js");
    expect(sw.reseau).not.toHaveBeenCalled();
  });

  it("fichier jamais vu et réseau coupé : réponse 503 propre", async () => {
    const sw = demarrerServiceWorker({ reseauCoupe: true });
    const reponse = await sw.requete("/icones/inconnue.png");
    expect(reponse!.status).toBe(503);
  });
});

// ---------- Manifeste, icônes, en-têtes ----------

/** Largeur et hauteur lues dans l'en-tête IHDR d'un PNG. */
function dimensionsPng(chemin: string): [number, number] {
  const octets = readFileSync(chemin);
  expect(octets.subarray(1, 4).toString("ascii")).toBe("PNG");
  return [octets.readUInt32BE(16), octets.readUInt32BE(20)];
}

describe("PWA - manifeste et fichiers du site", () => {
  const manifeste = JSON.parse(readFileSync(`${STATIQUES}/manifest.webmanifest`, "utf8")) as {
    start_url: string;
    scope: string;
    display: string;
    theme_color: string;
    lang: string;
    icons: Array<{ src: string; sizes: string; purpose: string }>;
    shortcuts: Array<{ url: string }>;
  };

  it("installable : application autonome, démarrage sur l'accueil, en français", () => {
    expect(manifeste.start_url).toBe("/");
    expect(manifeste.scope).toBe("/");
    expect(manifeste.display).toBe("standalone");
    expect(manifeste.theme_color).toBe("#0b1220");
    expect(manifeste.lang).toBe("fr");
  });

  it("icônes 192 et 512 px présentes, aux bonnes dimensions, dont une « maskable »", () => {
    const tailles = manifeste.icons.map((i) => i.sizes);
    expect(tailles).toContain("192x192");
    expect(tailles).toContain("512x512");
    expect(manifeste.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icone of manifeste.icons) {
      const [largeur, hauteur] = dimensionsPng(`${STATIQUES}${icone.src}`);
      expect(`${largeur}x${hauteur}`, icone.src).toBe(icone.sizes);
    }
  });

  it("raccourcis vers des pages qui existent dans le site", () => {
    const pages = readFileSync(racine("application-web/racine-application.tsx"), "utf8");
    for (const raccourci of manifeste.shortcuts) expect(pages).toContain(`"${raccourci.url}"`);
  });

  it("index.html déclare le manifeste et l'affichage plein écran", () => {
    const html = readFileSync(racine("application-web/index.html"), "utf8");
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain("viewport-fit=cover");
  });

  it("en-têtes : service worker toujours revérifié, CSP limitée à notre origine", () => {
    const entetes = readFileSync(`${STATIQUES}/_headers`, "utf8");
    expect(entetes).toMatch(/\/service-worker\.js\s+Cache-Control: no-cache/);
    expect(entetes).toContain("worker-src 'self'");
    expect(entetes).toContain("manifest-src 'self'");
    expect(entetes).toContain("script-src 'self';");
  });
});
