import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classerVariante, construireCatalogue } from "../catalogue/classification-cartes";
import { obtenirCatalogue, URL_SOURCE, viderCacheMemoire } from "../catalogue/source-cartes";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

/** 47 vraies cartes de la source (une par set et par catégorie), extraites le 2026-11-08. */
const ECHANTILLON = JSON.parse(
  readFileSync(fileURLToPath(new URL("./donnees/cartes-echantillon.json", import.meta.url).href), "utf8"),
) as Array<Record<string, unknown>>;

const reponseJson = (donnees: unknown, statut = 200) =>
  new Response(JSON.stringify(donnees), { status: statut, headers: { "Content-Type": "application/json" } });

beforeEach(() => viderCacheMemoire());
afterEach(() => vi.unstubAllGlobals());

describe("Classification des variantes", () => {
  it.each([
    ["001-166", "Common", "base"],
    ["019a-166", "Showcase", "alt"],
    ["168-166", "Showcase", "overnumbered"],
    ["189-star-166", "Showcase", "signee"],
    ["sp1-006", "Showcase", "special"],
    ["238-219", "Epic", "ultime"],
    ["r01", "Common", "rune"],
    ["r01a", "Showcase", "rune_alt"],
    ["t04", "Common", "token"],
  ] as const)("%s (%s) → %s", (numero, rarete, attendu) => {
    expect(classerVariante(numero, rarete)).toBe(attendu);
  });

  it("renvoie null pour un format inconnu", () => {
    expect(classerVariante("xyz", "Common")).toBeNull();
  });
});

describe("Construction du catalogue", () => {
  it("garde toutes les vraies cartes de l'échantillon et calcule les sets", () => {
    const catalogue = construireCatalogue(ECHANTILLON);
    expect(catalogue.cartesIgnorees).toBe(0);
    expect(catalogue.cartes).toHaveLength(ECHANTILLON.length);
    expect(catalogue.sets.map((s) => s.code)).toEqual(["ogn", "ogs", "sfd", "unl", "ven", "rad"]);
    expect(catalogue.sets.find((s) => s.code === "ogs")?.ouvrable).toBe(false);
    expect(catalogue.sets.find((s) => s.code === "ven")?.ouvrable).toBe(true);
    expect(catalogue.cartes.find((c) => c.code === "unl-238-219")?.variante).toBe("ultime");
  });

  it("ignore les cartes suspectes ou mal formées (la source est externe)", () => {
    const valide = ECHANTILLON[0] ?? {};
    const catalogue = construireCatalogue([
      valide,
      { ...valide, cardCode: "x2", imageUrl: "javascript:alert(1)" },
      { ...valide, cardCode: "x3", imageUrl: "https://pirate.example/image.png" },
      { ...valide, cardCode: "<script>" },
      { ...valide, cardCode: "x5", rarity: "Legendary" },
      { ...valide, cardCode: "x6", abilityEffective: "a".repeat(5000) },
      "pas un objet",
      null,
    ]);
    expect(catalogue.cartes).toHaveLength(1);
    expect(catalogue.cartesIgnorees).toBe(7);
  });

  it("supporte une source qui n'est pas une liste", () => {
    expect(construireCatalogue({ pas: "une liste" }).cartes).toHaveLength(0);
  });
});

describe("Cache du catalogue", () => {
  it("ne télécharge la source qu'une fois (cache mémoire)", async () => {
    const telecharger = vi.fn(async () => reponseJson(ECHANTILLON));
    await obtenirCatalogue({ telecharger, cache: null });
    await obtenirCatalogue({ telecharger, cache: null });
    expect(telecharger).toHaveBeenCalledTimes(1);
    expect(telecharger).toHaveBeenCalledWith(URL_SOURCE);
  });

  it("partage un seul téléchargement entre requêtes simultanées", async () => {
    const telecharger = vi.fn(async () => reponseJson(ECHANTILLON));
    await Promise.all([1, 2, 3].map(() => obtenirCatalogue({ telecharger, cache: null })));
    expect(telecharger).toHaveBeenCalledTimes(1);
  });

  it("garde l'ancienne version si la source tombe en panne après 24 h", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await obtenirCatalogue({ telecharger: async () => reponseJson(ECHANTILLON), cache: null });
      vi.setSystemTime(Date.now() + 25 * 60 * 60_000);
      const catalogue = await obtenirCatalogue({ telecharger: async () => reponseJson({}, 503), cache: null });
      expect(catalogue.cartes).toHaveLength(ECHANTILLON.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it("échoue proprement si la source est en panne et qu'il n'y a rien en mémoire", async () => {
    await expect(obtenirCatalogue({ telecharger: async () => reponseJson({}, 503), cache: null })).rejects.toThrow(/indisponible/);
  });

  it("écrit puis relit le Cache API Cloudflare", async () => {
    const stockage = new Map<string, Response>();
    const cache = {
      match: async (cle: string) => stockage.get(cle)?.clone(),
      put: async (cle: string, r: Response) => void stockage.set(cle, r),
    } as unknown as Cache;
    await obtenirCatalogue({ telecharger: async () => reponseJson(ECHANTILLON), cache });
    viderCacheMemoire();
    const telecharger = vi.fn(async () => reponseJson([]));
    const catalogue = await obtenirCatalogue({ telecharger, cache });
    expect(telecharger).not.toHaveBeenCalled();
    expect(catalogue.cartes).toHaveLength(ECHANTILLON.length);
  });
});

describe("Routes /api/catalogue", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => reponseJson(ECHANTILLON))));

  it("exige d'être connecté", async () => {
    const t = creerEnvironnementDeTest();
    expect((await t.appeler("GET", "/api/catalogue/sets")).statut).toBe(401);
    expect((await t.appeler("GET", "/api/catalogue/cartes")).statut).toBe(401);
  });

  it("liste les sets", async () => {
    const t = creerEnvironnementDeTest();
    const cookie = await t.inscrire("Alice", "mot-de-passe");
    const r = await t.appeler("GET", "/api/catalogue/sets", { cookie });
    expect(r.statut).toBe(200);
    expect((r.json.sets as Array<{ code: string }>).map((s) => s.code)).toContain("unl");
  });

  it("filtre par set, variante et recherche sans accents ni majuscules", async () => {
    const t = creerEnvironnementDeTest();
    const cookie = await t.inscrire("Alice", "mot-de-passe");
    const r = await t.appeler("GET", "/api/catalogue/cartes?set=unl&variante=ultime", { cookie });
    expect(r.json.total).toBe(1);
    expect((r.json.cartes as Array<{ nom: string }>)[0]?.nom).toBe("Baron Nashor");
    const recherche = await t.appeler("GET", "/api/catalogue/cartes?recherche=BARON%20nashor", { cookie });
    expect(recherche.json.total).toBe(1);
  });

  it("refuse des filtres invalides", async () => {
    const t = creerEnvironnementDeTest();
    const cookie = await t.inscrire("Alice", "mot-de-passe");
    expect((await t.appeler("GET", "/api/catalogue/cartes?rarete=Mythique", { cookie })).statut).toBe(400);
    expect((await t.appeler("GET", "/api/catalogue/cartes?set=<script>", { cookie })).statut).toBe(400);
  });

  it("renvoie le détail d'une carte ou 404", async () => {
    const t = creerEnvironnementDeTest();
    const cookie = await t.inscrire("Alice", "mot-de-passe");
    expect((await t.appeler("GET", "/api/catalogue/cartes/unl-238-219", { cookie })).statut).toBe(200);
    expect((await t.appeler("GET", "/api/catalogue/cartes/inexistante", { cookie })).statut).toBe(404);
  });
});
