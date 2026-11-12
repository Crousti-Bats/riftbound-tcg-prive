/** Éclats : recyclage des doublons (1 exemplaire gardé, plus ceux de mes decks), achat de booster, fabrication. */
import { beforeEach, describe, expect, it } from "vitest";
import { amorcerCataloguePourTest, viderCacheMemoire } from "../catalogue/source-cartes";
import { coutFabrication, doublonsDe, PRIX_BOOSTER, valeurRecyclage } from "../eclats/regles-eclats";
import { catalogueDeTest } from "./outils/catalogue-de-test";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

type Env = ReturnType<typeof creerEnvironnementDeTest>;

beforeEach(() => {
  viderCacheMemoire();
  amorcerCataloguePourTest(catalogueDeTest());
});

const idDe = (env: Env, pseudo: string) => (env.bd.prepare("SELECT id FROM comptes WHERE pseudo = ?").get(pseudo) as { id: number }).id;
const ajouter = (env: Env, id: number, code: string, foil: 0 | 1, n: number) =>
  env.bd.prepare("INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, ?, ?, ?)").run(id, code, foil, n);
const quantite = (env: Env, id: number, code: string, foil: 0 | 1) =>
  (env.bd.prepare("SELECT quantite FROM collection WHERE compte_id = ? AND card_code = ? AND est_foil = ?").get(id, code, foil) as
    | { quantite: number }
    | undefined)?.quantite ?? 0;
const solde = (env: Env, id: number) => (env.bd.prepare("SELECT eclats FROM comptes WHERE id = ?").get(id) as { eclats: number }).eclats;

describe("Règles des éclats", () => {
  const carte = (rarete: string, variante: string, type = "Unit") => ({ rarete, variante, type }) as never;

  it("valeurs : la variante prime, foil ×2, runes et tokens sans valeur ; fabrication ×40", () => {
    expect(valeurRecyclage(carte("Common", "base"), false)).toBe(1);
    expect(valeurRecyclage(carte("Rare", "base"), true)).toBe(10);
    expect(coutFabrication(carte("Rare", "base"))).toBe(200);
    expect(valeurRecyclage(carte("Showcase", "alt"), false)).toBe(80);
    expect(valeurRecyclage(carte("Common", "base", "Rune"), false)).toBe(0);
    expect(valeurRecyclage(carte("Common", "token", "Token"), false)).toBe(0);
    expect(coutFabrication(carte("Epic", "base"))).toBe(1600);
    expect(coutFabrication(carte("Common", "base", "Rune"))).toBeNull();
  });

  it("doublons : les normales partent d'abord, la foil est gardée", () => {
    expect(doublonsDe({ normale: 1, foil: 1 }, 1)).toEqual({ normale: 1, foil: 0 });
    expect(doublonsDe({ normale: 0, foil: 3 }, 1)).toEqual({ normale: 0, foil: 2 });
    expect(doublonsDe({ normale: 4, foil: 1 }, 3)).toEqual({ normale: 2, foil: 0 });
    expect(doublonsDe({ normale: 2, foil: 0 }, 3)).toEqual({ normale: 0, foil: 0 });
  });
});

describe("API /api/eclats", () => {
  it("recycle tous les doublons en gardant 1 exemplaire, et plus pour une carte utilisée dans un deck", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idDe(env, "Alice");
    ajouter(env, id, "ogn-c0", 0, 5); // 4 doublons × 1
    ajouter(env, id, "ogn-r0", 0, 1);
    ajouter(env, id, "ogn-r0", 1, 1); // 1 doublon : la normale part (5), la foil reste
    ajouter(env, id, "ogn-e0", 0, 4); // deck en utilise 3 → 1 doublon × 40
    ajouter(env, id, "ogn-rune0", 0, 9); // rune : jamais recyclée
    env.bd
      .prepare("INSERT INTO decks (compte_id, nom, contenu, cree_le, modifie_le) VALUES (?, 'D', ?, 0, 0)")
      .run(id, JSON.stringify({ legende: null, champion: null, principal: [{ code: "ogn-e0", n: 3 }], runes: [], terrains: [] }));

    const apercu = (await env.appeler("GET", "/api/eclats", { cookie })).json as { doublons: { exemplaires: number; eclats: number } };
    expect(apercu.doublons).toMatchObject({ exemplaires: 6, eclats: 49 });

    const r = await env.appeler("POST", "/api/eclats/recycler", { cookie, corps: {} });
    expect(r.statut).toBe(200);
    expect(r.json).toMatchObject({ gain: 49, exemplaires: 6, solde: 49 });
    expect(quantite(env, id, "ogn-c0", 0)).toBe(1);
    expect(quantite(env, id, "ogn-r0", 0)).toBe(0);
    expect(quantite(env, id, "ogn-r0", 1)).toBe(1);
    expect(quantite(env, id, "ogn-e0", 0)).toBe(3);
    expect(quantite(env, id, "ogn-rune0", 0)).toBe(9);

    // Plus rien à recycler.
    expect((await env.appeler("POST", "/api/eclats/recycler", { cookie, corps: {} })).statut).toBe(409);
  });

  it("recycle une carte précise (foil ×2) sans jamais passer sous les exemplaires protégés", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idDe(env, "Alice");
    ajouter(env, id, "ogn-r1", 0, 1);
    ajouter(env, id, "ogn-r1", 1, 2);

    const foil = await env.appeler("POST", "/api/eclats/recycler", { cookie, corps: { code: "ogn-r1", foil: true, n: 2 } });
    expect(foil.json).toMatchObject({ gain: 20, solde: 20 });
    expect(quantite(env, id, "ogn-r1", 1)).toBe(0);
    // Il n'en reste qu'un : refusé.
    expect((await env.appeler("POST", "/api/eclats/recycler", { cookie, corps: { code: "ogn-r1", n: 1 } })).statut).toBe(409);
    expect(quantite(env, id, "ogn-r1", 0)).toBe(1);
    // Rune ou carte inconnue : refusé.
    expect((await env.appeler("POST", "/api/eclats/recycler", { cookie, corps: { code: "ogn-rune0" } })).statut).toBe(400);
  });

  it("recycle seulement la sélection : certaines cartes, avec ou sans les foils", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idDe(env, "Alice");
    ajouter(env, id, "ogn-c0", 0, 3); // commune : 5 exemplaires, 4 en trop = 3 normales + 1 foil
    ajouter(env, id, "ogn-c0", 1, 2);
    ajouter(env, id, "ogn-u0", 0, 2); // peu commune : 1 doublon
    ajouter(env, id, "ogn-r0", 0, 2); // rare : 1 doublon, non sélectionnée

    const apercu = (await env.appeler("GET", "/api/eclats", { cookie })).json as {
      doublons: { cartes: Array<{ code: string; categorie: string }> };
    };
    expect(apercu.doublons.cartes.find((c) => c.code === "ogn-c0")?.categorie).toBe("commune");
    expect(apercu.doublons.cartes.find((c) => c.code === "ogn-u0")?.categorie).toBe("peu-commune");

    const r = await env.appeler("POST", "/api/eclats/recycler", { cookie, corps: { codes: ["ogn-c0", "ogn-u0"], avecFoils: false } });
    expect(r.json).toMatchObject({ gain: 3 + 3, exemplaires: 4 });
    expect(quantite(env, id, "ogn-c0", 0)).toBe(0);
    expect(quantite(env, id, "ogn-c0", 1)).toBe(2); // la foil en trop n'est pas recyclée
    expect(quantite(env, id, "ogn-u0", 0)).toBe(1);
    expect(quantite(env, id, "ogn-r0", 0)).toBe(2); // pas dans la sélection

    // Sélection sans aucun doublon : rien à faire.
    expect((await env.appeler("POST", "/api/eclats/recycler", { cookie, corps: { codes: ["ogn-u0"] } })).statut).toBe(409);
  });

  it("un recyclage dont la collection a changé entre-temps est entièrement annulé", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idDe(env, "Alice");
    ajouter(env, id, "ogn-c1", 0, 3);
    // Deux recyclages simultanés des mêmes doublons : un seul est crédité.
    const [a, b] = await Promise.all([
      env.appeler("POST", "/api/eclats/recycler", { cookie, corps: {} }),
      env.appeler("POST", "/api/eclats/recycler", { cookie, corps: {} }),
    ]);
    expect([a.statut, b.statut].sort()).toEqual([200, 409]);
    expect(solde(env, id)).toBe(2);
    expect(quantite(env, id, "ogn-c1", 0)).toBe(1);
  });

  it("achète un booster offert et fabrique une carte avec ses éclats ; solde insuffisant refusé sans rien écrire", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idDe(env, "Alice");
    const bonusAvant = (env.bd.prepare("SELECT boosters_bonus FROM comptes WHERE id = ?").get(id) as { boosters_bonus: number }).boosters_bonus;

    expect((await env.appeler("POST", "/api/eclats/acheter-booster", { cookie, corps: {} })).json).toMatchObject({ erreur: "eclats_insuffisants" });
    env.bd.prepare("UPDATE comptes SET eclats = ? WHERE id = ?").run(PRIX_BOOSTER + 1600, id);

    const achat = await env.appeler("POST", "/api/eclats/acheter-booster", { cookie, corps: {} });
    expect(achat.json).toMatchObject({ solde: 1600, offerts: bonusAvant + 1 });

    env.bd.prepare("INSERT INTO wishlist (compte_id, card_code, ajoutee_le) VALUES (?, 'ogn-e1', 0)").run(id);
    const fab = await env.appeler("POST", "/api/eclats/fabriquer", { cookie, corps: { code: "ogn-e1" } });
    expect(fab.json).toMatchObject({ cout: 1600, solde: 0 });
    expect(quantite(env, id, "ogn-e1", 0)).toBe(1);
    expect(env.bd.prepare("SELECT 1 FROM wishlist WHERE compte_id = ?").get(id)).toBeUndefined();

    const refus = await env.appeler("POST", "/api/eclats/fabriquer", { cookie, corps: { code: "ogn-e1" } });
    expect(refus.json).toMatchObject({ erreur: "eclats_insuffisants" });
    expect(quantite(env, id, "ogn-e1", 0)).toBe(1);
    expect((await env.appeler("POST", "/api/eclats/fabriquer", { cookie, corps: { code: "ogn-rune0" } })).statut).toBe(400);
  });

  it("fiche : exemplaires protégés et valeurs ; connexion obligatoire", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    ajouter(env, idDe(env, "Alice"), "ogn-alt0", 0, 2);
    const r = await env.appeler("GET", "/api/eclats/carte/ogn-alt0", { cookie });
    expect(r.json).toMatchObject({ proteges: 1, recyclables: 1, valeur: { normale: 80, foil: 160 }, coutFabrication: 3200 });
    expect((await env.appeler("GET", "/api/eclats")).statut).toBe(401);
  });
});

describe("Tri de la collection par nombre d'exemplaires", () => {
  it("le plus d'exemplaires d'abord (normale + foil), ou l'inverse", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idDe(env, "Alice");
    ajouter(env, id, "ogn-c0", 0, 2);
    ajouter(env, id, "ogn-c1", 0, 1);
    ajouter(env, id, "ogn-c1", 1, 3);
    ajouter(env, id, "ogn-c2", 0, 1);
    const codes = async (tri: string) =>
      ((await env.appeler("GET", `/api/collection?tri=${tri}`, { cookie })).json.cartes as Array<{ code: string }>).map((c) => c.code);
    expect(await codes("quantite-desc")).toEqual(["ogn-c1", "ogn-c0", "ogn-c2"]);
    expect(await codes("quantite-asc")).toEqual(["ogn-c2", "ogn-c0", "ogn-c1"]);
  });
});
