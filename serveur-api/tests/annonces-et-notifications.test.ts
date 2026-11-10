/** Bandeau d'annonce de l'admin et notifications push « boosters pleins ». */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { construireServiceWorker } from "../../configuration/plugin-service-worker";
import pointEntree from "../point-entree-api";
import { MESSAGE_BOOSTERS_PLEINS, prevenirBoostersPleins } from "../notifications/boosters-pleins";
import { depuisBase64Url, versBase64Url } from "../securite/jetons-et-empreintes";
import { chiffrerMessage, estEndpointAutorise, type ClesVapid } from "../notifications/web-push";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

const MDP = "mot-de-passe-solide";
const MINUTE = 60_000;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Env = ReturnType<typeof creerEnvironnementDeTest>;

async function adminEleve(t: Env) {
  const cookie = await t.inscrire("Crousti", MDP, "admin");
  expect((await t.appeler("POST", "/api/admin/elevation", { cookie, corps: { motDePasse: MDP } })).statut).toBe(200);
  return cookie;
}

// ---------- Outils : clés VAPID et navigateur abonné simulés ----------

async function genererClesVapid(): Promise<ClesVapid> {
  const paire = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", paire.privateKey)) as JsonWebKey;
  const publique = new Uint8Array((await crypto.subtle.exportKey("raw", paire.publicKey)) as ArrayBuffer);
  return { publique: versBase64Url(publique), privee: jwk.d!, sujet: "https://exemple.dev" };
}

/** Un « navigateur » : sa paire ECDH et son secret, comme ceux que crée PushManager.subscribe(). */
async function navigateurAbonne(endpoint = `https://fcm.googleapis.com/fcm/send/${Math.random().toString(36).slice(2)}`) {
  const paire = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const publique = new Uint8Array((await crypto.subtle.exportKey("raw", paire.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { paire, abonnement: { endpoint, p256dh: versBase64Url(publique), auth: versBase64Url(auth) } };
}

async function hkdf(sel: Uint8Array, ikm: Uint8Array, info: Uint8Array, octets: number) {
  const cle = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sel as BufferSource, info: info as BufferSource }, cle, octets * 8));
}

/** Déchiffrement RFC 8291 côté navigateur (pour vérifier ce que reçoit vraiment l'abonné). */
async function dechiffrer(corps: Uint8Array, navigateur: Awaited<ReturnType<typeof navigateurAbonne>>): Promise<string> {
  const sel = corps.slice(0, 16);
  const longueurCle = corps[20]!;
  const clePubliqueServeur = corps.slice(21, 21 + longueurCle);
  const chiffre = corps.slice(21 + longueurCle);
  const cleServeur = await crypto.subtle.importKey("raw", clePubliqueServeur, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: cleServeur } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0], navigateur.paire.privateKey, 256));
  const t = new TextEncoder();
  const publiqueNavigateur = depuisBase64Url(navigateur.abonnement.p256dh);
  const info = new Uint8Array([...t.encode("WebPush: info\0"), ...publiqueNavigateur, ...clePubliqueServeur]);
  const ikm = await hkdf(depuisBase64Url(navigateur.abonnement.auth), secret, info, 32);
  const cek = await hkdf(sel, ikm, t.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sel, ikm, t.encode("Content-Encoding: nonce\0"), 12);
  const cleAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const clair = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, cleAes, chiffre));
  expect(clair.at(-1)).toBe(2); // délimiteur « dernier enregistrement »
  return new TextDecoder().decode(clair.slice(0, -1));
}

/** Faux service de push : enregistre les envois et répond le statut demandé. */
function fauxServicePush(statut = 201) {
  const envois: Array<{ url: string; entetes: Headers; corps: Uint8Array }> = [];
  const telecharger = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    envois.push({ url: String(url), entetes: new Headers(init?.headers), corps: new Uint8Array(init?.body as Uint8Array) });
    return new Response(null, { status: statut });
  });
  return { envois, telecharger: telecharger as unknown as typeof fetch };
}

async function avecNotifications(t: Env) {
  const cles = await genererClesVapid();
  Object.assign(t.env, { VAPID_CLE_PUBLIQUE: cles.publique, VAPID_CLE_PRIVEE: cles.privee });
  return cles;
}

// ---------- Bandeau d'annonce ----------

describe("Bandeau d'annonce", () => {
  it("l'admin publie, tous les joueurs la voient, une nouvelle remplace l'ancienne, puis il la retire", async () => {
    const t = creerEnvironnementDeTest();
    const admin = await adminEleve(t);
    const alice = await t.inscrire("Alice", MDP);
    expect((await t.appeler("GET", "/api/annonce-site", { cookie: alice })).json.annonce).toBeNull();

    expect((await t.appeler("POST", "/api/admin/annonce-site", { cookie: admin, corps: { texte: "  Boosters remis à 15 !  " } })).statut).toBe(201);
    const vue = await t.appeler("GET", "/api/annonce-site", { cookie: alice });
    expect(vue.json.annonce).toMatchObject({ texte: "Boosters remis à 15 !" });

    await t.appeler("POST", "/api/admin/annonce-site", { cookie: admin, corps: { texte: "Tournoi samedi" } });
    const nouvelle = (await t.appeler("GET", "/api/annonce-site", { cookie: alice })).json.annonce as { id: number; texte: string };
    expect(nouvelle.texte).toBe("Tournoi samedi");
    expect(nouvelle.id).not.toBe((vue.json.annonce as { id: number }).id);

    expect((await t.appeler("DELETE", "/api/admin/annonce-site", { cookie: admin })).statut).toBe(200);
    expect((await t.appeler("GET", "/api/annonce-site", { cookie: alice })).json.annonce).toBeNull();
    expect((await t.appeler("DELETE", "/api/admin/annonce-site", { cookie: admin })).statut).toBe(404);

    const types = (t.bd.prepare("SELECT type FROM journal WHERE categorie = 'admin'").all() as Array<{ type: string }>).map((l) => l.type);
    expect(types.filter((x) => x === "annonce_publiee")).toHaveLength(2);
    expect(types).toContain("annonce_retiree");
  });

  it("réservé à l'admin avec accès ouvert ; visiteurs refusés", async () => {
    const t = creerEnvironnementDeTest();
    const alice = await t.inscrire("Alice", MDP);
    const admin = await t.inscrire("Crousti", MDP, "admin"); // sans élévation
    expect((await t.appeler("POST", "/api/admin/annonce-site", { cookie: alice, corps: { texte: "pirate" } })).statut).toBe(403);
    expect((await t.appeler("POST", "/api/admin/annonce-site", { cookie: admin, corps: { texte: "x" } })).json.erreur).toBe("elevation_requise");
    expect((await t.appeler("DELETE", "/api/admin/annonce-site", { cookie: alice })).statut).toBe(403);
    expect((await t.appeler("GET", "/api/annonce-site")).statut).toBe(401);
  });

  it("refuse une annonce vide, trop longue ou avec des champs en trop ; garde le texte brut", async () => {
    const t = creerEnvironnementDeTest();
    const admin = await adminEleve(t);
    for (const corps of [{ texte: "   " }, { texte: "x".repeat(301) }, { texte: "ok", couleur: "rouge" }]) {
      expect((await t.appeler("POST", "/api/admin/annonce-site", { cookie: admin, corps })).statut).toBe(400);
    }
    await t.appeler("POST", "/api/admin/annonce-site", { cookie: admin, corps: { texte: "<img src=x onerror=alert(1)>" } });
    expect(((await t.appeler("GET", "/api/annonce-site", { cookie: admin })).json.annonce as { texte: string }).texte).toBe(
      "<img src=x onerror=alert(1)>",
    );
  });
});

// ---------- Abonnements ----------

describe("Notifications : abonnements", () => {
  it("n'accepte que les services de push des navigateurs (pas d'adresse interne ni arbitraire)", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QGz",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect(estEndpointAutorise(ok), ok).toBe(true);
    }
    for (const refuse of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/x",
      "https://user@fcm.googleapis.com/x",
      "https://fcm.googleapis.com.evil.com/x",
      "https://evil.com/fcm.googleapis.com",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "pas une url",
    ]) {
      expect(estEndpointAutorise(refuse), refuse).toBe(false);
    }
  });

  it("enregistre, met à jour et supprime un abonnement ; refuse les données invalides", async () => {
    const t = creerEnvironnementDeTest();
    const alice = await t.inscrire("Alice", MDP);
    const bob = await t.inscrire("Bob", MDP);
    const { abonnement } = await navigateurAbonne();

    expect((await t.appeler("POST", "/api/notifications/abonnement", { corps: abonnement })).statut).toBe(401);
    expect((await t.appeler("POST", "/api/notifications/abonnement", { cookie: alice, corps: abonnement })).statut).toBe(201);
    expect((await t.appeler("POST", "/api/notifications/abonnement", { cookie: alice, corps: abonnement })).statut).toBe(201); // idempotent
    expect(t.bd.prepare("SELECT COUNT(*) AS n FROM abonnements_push").get()).toEqual({ n: 1 });

    for (const corps of [
      { ...abonnement, endpoint: "https://evil.com/x" },
      { ...abonnement, p256dh: "court" },
      { ...abonnement, auth: "!!!" },
      { ...abonnement, compte: 1 },
    ]) {
      expect((await t.appeler("POST", "/api/notifications/abonnement", { cookie: alice, corps })).statut).toBe(400);
    }

    // Bob ne peut pas désabonner le téléphone d'Alice.
    await t.appeler("POST", "/api/notifications/desabonnement", { cookie: bob, corps: { endpoint: abonnement.endpoint } });
    expect(t.bd.prepare("SELECT COUNT(*) AS n FROM abonnements_push").get()).toEqual({ n: 1 });
    await t.appeler("POST", "/api/notifications/desabonnement", { cookie: alice, corps: { endpoint: abonnement.endpoint } });
    expect(t.bd.prepare("SELECT COUNT(*) AS n FROM abonnements_push").get()).toEqual({ n: 0 });
  });

  it("garde au plus 10 appareils par compte (les plus récents)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = creerEnvironnementDeTest();
    const alice = await t.inscrire("Alice", MDP);
    for (let i = 0; i < 12; i++) {
      vi.setSystemTime(Date.now() + 1000);
      const { abonnement } = await navigateurAbonne(`https://fcm.googleapis.com/fcm/send/appareil-${i}`);
      await t.appeler("POST", "/api/notifications/abonnement", { cookie: alice, corps: abonnement });
    }
    const restants = (t.bd.prepare("SELECT endpoint FROM abonnements_push ORDER BY endpoint").all() as Array<{ endpoint: string }>).map((l) =>
      l.endpoint.replace(/.*appareil-/, ""),
    );
    expect(restants).toHaveLength(10);
    expect(restants).not.toContain("0");
    expect(restants).not.toContain("1");
  });

  it("clé publique : 503 tant que le serveur n'est pas configuré", async () => {
    const t = creerEnvironnementDeTest();
    const alice = await t.inscrire("Alice", MDP);
    expect((await t.appeler("GET", "/api/notifications/cle-publique", { cookie: alice })).statut).toBe(503);
    const cles = await avecNotifications(t);
    expect((await t.appeler("GET", "/api/notifications/cle-publique", { cookie: alice })).json.clePublique).toBe(cles.publique);
  });

  it("notification d'essai : message chiffré lisible par l'appareil, en-têtes VAPID, 5 essais par heure", async () => {
    const t = creerEnvironnementDeTest();
    const cles = await avecNotifications(t);
    const alice = await t.inscrire("Alice", MDP);
    const navigateur = await navigateurAbonne();
    await t.appeler("POST", "/api/notifications/abonnement", { cookie: alice, corps: navigateur.abonnement });
    const service = fauxServicePush();
    vi.stubGlobal("fetch", service.telecharger);

    const r = await t.appeler("POST", "/api/notifications/test", { cookie: alice, corps: {} });
    expect(r.json).toEqual({ envoyes: 1, appareils: 1 });
    const envoi = service.envois[0]!;
    expect(envoi.url).toBe(navigateur.abonnement.endpoint);
    expect(envoi.entetes.get("Content-Encoding")).toBe("aes128gcm");
    expect(envoi.entetes.get("Authorization")).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${cles.publique}$`));
    expect(JSON.parse(await dechiffrer(envoi.corps, navigateur))).toMatchObject({ titre: "Notifications activées", url: "/" });

    for (let i = 0; i < 4; i++) await t.appeler("POST", "/api/notifications/test", { cookie: alice, corps: {} });
    expect((await t.appeler("POST", "/api/notifications/test", { cookie: alice, corps: {} })).statut).toBe(429);
  });

  it("chaque message utilise une clé et un sel nouveaux (deux envois identiques sont différents)", async () => {
    const { abonnement } = await navigateurAbonne();
    const a = await chiffrerMessage(abonnement, "même message");
    const b = await chiffrerMessage(abonnement, "même message");
    expect(versBase64Url(a)).not.toBe(versBase64Url(b));
  });
});

// ---------- Tâche planifiée « boosters pleins » ----------

describe("Notifications : boosters pleins (tâche planifiée)", () => {
  async function joueurAbonne(t: Env, pseudo = "Alice") {
    const cookie = await t.inscrire(pseudo, MDP);
    const navigateur = await navigateurAbonne();
    await t.appeler("POST", "/api/notifications/abonnement", { cookie, corps: navigateur.abonnement });
    const id = (t.bd.prepare("SELECT id FROM comptes WHERE pseudo = ?").get(pseudo) as { id: number }).id;
    const stock = (stockSauve: number, tick: number) =>
      t.bd.prepare("UPDATE comptes SET stock_boosters = ?, boosters_tick = ? WHERE id = ?").run(stockSauve, tick, id);
    return { cookie, navigateur, id, stock };
  }

  it("prévient une seule fois quand le stock atteint 10/10", async () => {
    const t = creerEnvironnementDeTest();
    const cles = await genererClesVapid();
    const alice = await joueurAbonne(t);
    alice.stock(5, Date.now() - 100 * MINUTE); // 5 + 6 × 15 min ≥ 10 : plein maintenant
    const service = fauxServicePush();

    expect(await prevenirBoostersPleins(t.d1, cles, service.telecharger)).toEqual({ comptes: 1, envoyes: 1 });
    expect(JSON.parse(await dechiffrer(service.envois[0]!.corps, alice.navigateur))).toEqual(MESSAGE_BOOSTERS_PLEINS);
    expect(await prevenirBoostersPleins(t.d1, cles, service.telecharger)).toEqual({ comptes: 0, envoyes: 0 });
  });

  it("ne prévient pas avant que le stock soit plein, ni un compte resté à 10 sans rien ouvrir", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = creerEnvironnementDeTest();
    const cles = await genererClesVapid();
    const alice = await joueurAbonne(t, "Alice");
    await joueurAbonne(t, "Bob"); // 10 boosters à l'inscription, jamais ouverts
    alice.stock(8, Date.now() - 0 * MINUTE); // plein dans 30 minutes
    const service = fauxServicePush();

    expect((await prevenirBoostersPleins(t.d1, cles, service.telecharger)).envoyes).toBe(0);
    vi.setSystemTime(Date.now() + 29 * MINUTE);
    expect((await prevenirBoostersPleins(t.d1, cles, service.telecharger)).envoyes).toBe(0);
    vi.setSystemTime(Date.now() + 2 * MINUTE);
    expect((await prevenirBoostersPleins(t.d1, cles, service.telecharger)).envoyes).toBe(1);
  });

  it("après une ouverture, le remplissage suivant est de nouveau notifié", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = creerEnvironnementDeTest();
    const cles = await genererClesVapid();
    const alice = await joueurAbonne(t);
    alice.stock(9, Date.now() - 20 * MINUTE);
    const service = fauxServicePush();
    expect((await prevenirBoostersPleins(t.d1, cles, service.telecharger)).envoyes).toBe(1);

    expect((await t.appeler("POST", "/api/boosters/ouvrir", { cookie: alice.cookie, corps: { set: "ogn" } })).statut).toBe(200);
    expect((await prevenirBoostersPleins(t.d1, cles, service.telecharger)).envoyes).toBe(0); // 9/10
    vi.setSystemTime(Date.now() + 15 * MINUTE + 1);
    expect((await prevenirBoostersPleins(t.d1, cles, service.telecharger)).envoyes).toBe(1);
  });

  it("supprime un abonnement que le navigateur a résilié (410) et ignore les comptes sans abonnement", async () => {
    const t = creerEnvironnementDeTest();
    const cles = await genererClesVapid();
    const alice = await joueurAbonne(t);
    alice.stock(0, Date.now() - 200 * MINUTE);
    await t.inscrire("SansNotif", MDP);
    t.bd.prepare("UPDATE comptes SET stock_boosters = 0, boosters_tick = ? WHERE pseudo = 'SansNotif'").run(Date.now() - 200 * MINUTE);

    const service = fauxServicePush(410);
    expect(await prevenirBoostersPleins(t.d1, cles, service.telecharger)).toEqual({ comptes: 1, envoyes: 0 });
    expect(service.envois).toHaveLength(1);
    expect(t.bd.prepare("SELECT COUNT(*) AS n FROM abonnements_push").get()).toEqual({ n: 0 });
  });

  it("ne prévient pas un compte désactivé", async () => {
    const t = creerEnvironnementDeTest();
    const cles = await genererClesVapid();
    const alice = await joueurAbonne(t);
    alice.stock(0, Date.now() - 200 * MINUTE);
    t.bd.prepare("UPDATE comptes SET actif = 0 WHERE id = ?").run(alice.id);
    expect((await prevenirBoostersPleins(t.d1, cles, fauxServicePush().telecharger)).comptes).toBe(0);
  });

  it("le Worker expose bien la tâche planifiée, qui ne fait rien sans clé privée", async () => {
    const t = creerEnvironnementDeTest();
    expect(typeof pointEntree.fetch).toBe("function");
    await expect(pointEntree.scheduled({} as ScheduledController, t.env as never)).resolves.toBeUndefined();
  });
});

// ---------- Service worker ----------

describe("Service worker : notifications", () => {
  function demarrer() {
    const ecouteurs = new Map<string, (evenement: unknown) => void>();
    const affichees: Array<{ titre: string; options: { body: string; data: { url: string } } }> = [];
    const ouvertes: string[] = [];
    const self = {
      location: { origin: "https://riftbound.exemple.dev" },
      addEventListener: (type: string, f: (evenement: unknown) => void) => ecouteurs.set(type, f),
      registration: {
        showNotification: async (titre: string, options: { body: string; data: { url: string } }) => void affichees.push({ titre, options }),
      },
      clients: { matchAll: async () => [], openWindow: async (url: string) => void ouvertes.push(url) },
    };
    const modele = readFileSync(fileURLToPath(new URL("../../application-web/service-worker/modele-service-worker.js", import.meta.url).href), "utf8");
    vm.runInNewContext(construireServiceWorker(modele, []), { self, caches: {}, fetch, URL, Response });
    async function declencher(type: string, evenement: Record<string, unknown>) {
      const attentes: Promise<unknown>[] = [];
      ecouteurs.get(type)!({ ...evenement, waitUntil: (p: Promise<unknown>) => attentes.push(p) });
      await Promise.all(attentes);
    }
    return { affichees, ouvertes, declencher };
  }

  it("affiche la notification reçue, et une notification générique si le message est illisible", async () => {
    const sw = demarrer();
    await sw.declencher("push", { data: { json: () => MESSAGE_BOOSTERS_PLEINS } });
    await sw.declencher("push", { data: { json: () => { throw new Error("pas du JSON"); } } });
    expect(sw.affichees[0]).toMatchObject({ titre: MESSAGE_BOOSTERS_PLEINS.titre, options: { body: MESSAGE_BOOSTERS_PLEINS.texte } });
    expect(sw.affichees[1]?.titre).toBe("Riftbound");
  });

  it("toucher la notification ouvre le site, jamais une adresse externe", async () => {
    const sw = demarrer();
    const toucher = (url: string) => sw.declencher("notificationclick", { notification: { close: () => undefined, data: { url } } });
    await toucher("/collection");
    await toucher("https://evil.com/");
    await toucher("//evil.com/");
    expect(sw.ouvertes).toEqual([
      "https://riftbound.exemple.dev/collection",
      "https://riftbound.exemple.dev/",
      "https://riftbound.exemple.dev/",
    ]);
  });
});
