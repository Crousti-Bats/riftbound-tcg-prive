/** Tests de l'aperçu d'un booster (plus rares, cartes manquantes) et de la wishlist (et son affichage au marché). */
import { beforeEach, describe, expect, it } from "vitest";
import { unBoosterSur } from "../boosters/apercu-booster";
import { viderCachePools } from "../boosters/pools";
import { amorcerCataloguePourTest, viderCacheMemoire } from "../catalogue/source-cartes";
import { MAX_WISHLIST } from "../wishlist/routes-wishlist";
import { catalogueDeTest } from "./outils/catalogue-de-test";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

type Env = ReturnType<typeof creerEnvironnementDeTest>;
interface CarteApercu { code: string; quantite: number; quantiteFoil: number; enWishlist: boolean }
interface Apercu {
  plusRares: Array<{ categorie: string; unBoosterSur: number; cartes: CarteApercu[] }>;
  manquantes: { total: number; possedees: number; nombre: number; cartes: CarteApercu[] };
}
interface Souhait { auteur: string; estMoi: boolean; jePossede: number; carte: { code: string } }

beforeEach(() => {
  viderCacheMemoire();
  viderCachePools();
  amorcerCataloguePourTest(catalogueDeTest());
});

function id(env: Env, pseudo: string): number {
  return (env.bd.prepare("SELECT id FROM comptes WHERE pseudo = ?").get(pseudo) as { id: number }).id;
}
function donner(env: Env, pseudo: string, code: string, quantite: number, foil: 0 | 1 = 0): void {
  env.bd.prepare("INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, ?, ?, ?)").run(id(env, pseudo), code, foil, quantite);
}
const apercu = async (env: Env, cookie: string, set: string) =>
  (await env.appeler("GET", `/api/boosters/apercu?set=${set}`, { cookie })).json as unknown as Apercu;
const wishlists = async (env: Env, cookie: string) =>
  (await env.appeler("GET", "/api/marche/annonces", { cookie })).json.wishlists as Souhait[];

describe("Aperçu d'un booster", () => {
  it("chances par booster calculées depuis les taux (2 slots Rare+, plus le slot Foil pour les Epic)", () => {
    expect(unBoosterSur("ultime")).toBe(4000);
    expect(unBoosterSur("special")).toBe(4000);
    expect(unBoosterSur("signee")).toBe(960);
    expect(unBoosterSur("overnumbered")).toBe(288);
    expect(unBoosterSur("alt")).toBe(48);
    expect(unBoosterSur("epic")).toBe(24);
  });

  it("les plus rares : seulement les catégories présentes dans le set, la plus rare d'abord", async () => {
    const env = creerEnvironnementDeTest();
    const alice = await env.inscrire("Alice", "mot-de-passe-alice");
    expect((await apercu(env, alice, "unl")).plusRares.map((g) => g.categorie)).toEqual(["ultime", "special", "signee", "overnumbered", "alt", "epic"]);
    const ven = await apercu(env, alice, "ven"); // ni Special ni Ultime
    expect(ven.plusRares.map((g) => g.categorie)).toEqual(["signee", "overnumbered", "alt", "epic"]);
    expect(ven.plusRares.find((g) => g.categorie === "alt")?.cartes.map((c) => c.code)).toEqual(["ven-alt0", "ven-alt1"]);
  });

  it("il te manque : cartes du booster jamais obtenues, les plus rares d'abord, avec la wishlist", async () => {
    const env = creerEnvironnementDeTest();
    const alice = await env.inscrire("Alice", "mot-de-passe-alice");
    const vide = await apercu(env, alice, "ven");
    expect(vide.manquantes).toMatchObject({ total: 29, possedees: 0, nombre: 29 });
    expect(vide.manquantes.cartes[0]?.code).toBe("ven-sig0");
    expect(vide.manquantes.cartes.at(-1)?.code).toBe("ven-tok1");

    donner(env, "Alice", "ven-sig0", 1, 1); // foil seulement : possédée quand même
    donner(env, "Alice", "ven-c0", 2);
    await env.appeler("POST", "/api/wishlist", { cookie: alice, corps: { code: "ven-alt1" } });
    const apres = await apercu(env, alice, "ven");
    expect(apres.manquantes).toMatchObject({ total: 29, possedees: 2, nombre: 27 });
    expect(apres.manquantes.cartes.some((c) => c.code === "ven-sig0" || c.code === "ven-c0")).toBe(false);
    expect(apres.manquantes.cartes.find((c) => c.code === "ven-alt1")?.enWishlist).toBe(true);
    expect(apres.plusRares.find((g) => g.categorie === "signee")?.cartes[0]).toMatchObject({ quantiteFoil: 1 });
  });

  it("refuse un set non ouvrable ou invalide, et sans connexion", async () => {
    const env = creerEnvironnementDeTest();
    const alice = await env.inscrire("Alice", "mot-de-passe-alice");
    expect((await env.appeler("GET", "/api/boosters/apercu?set=ogs", { cookie: alice })).statut).toBe(400);
    expect((await env.appeler("GET", "/api/boosters/apercu?set=../x", { cookie: alice })).statut).toBe(400);
    expect((await env.appeler("GET", "/api/boosters/apercu?set=ogn")).statut).toBe(401);
  });
});

describe("Cœurs de wishlist sur les boosters", () => {
  it("compte, par set, les cartes de ma wishlist pas encore obtenues que ce booster peut donner", async () => {
    const env = creerEnvironnementDeTest();
    const alice = await env.inscrire("Alice", "mot-de-passe-alice");
    for (const code of ["ven-alt0", "ven-sig0", "ogn-e0", "ogs-c0"]) await env.appeler("POST", "/api/wishlist", { cookie: alice, corps: { code } });
    donner(env, "Alice", "ven-sig0", 1); // obtenue : ne compte plus
    const r = await env.appeler("GET", "/api/boosters/wishlist", { cookie: alice });
    expect(r.json.parSet).toMatchObject({ ven: 1, ogn: 1, sfd: 0, unl: 0 });
    expect("ogs" in (r.json.parSet as object)).toBe(false); // set non ouvrable en booster
  });
});

describe("Wishlist", () => {
  it("ajout, liste, doublon sans effet, retrait ; carte inconnue refusée", async () => {
    const env = creerEnvironnementDeTest();
    const alice = await env.inscrire("Alice", "mot-de-passe-alice");
    expect((await env.appeler("POST", "/api/wishlist", { cookie: alice, corps: { code: "ogn-e0" } })).statut).toBe(201);
    expect((await env.appeler("POST", "/api/wishlist", { cookie: alice, corps: { code: "ogn-e0" } })).statut).toBe(201);
    expect((await env.appeler("POST", "/api/wishlist", { cookie: alice, corps: { code: "zzz-999" } })).statut).toBe(404);
    expect((await env.appeler("POST", "/api/wishlist", { cookie: alice, corps: { code: "ogn-e0", foil: true } })).statut).toBe(400);
    const liste = await env.appeler("GET", "/api/wishlist", { cookie: alice });
    expect((liste.json.cartes as Array<{ carte: { code: string } }>).map((c) => c.carte.code)).toEqual(["ogn-e0"]);
    expect((await env.appeler("DELETE", "/api/wishlist/ogn-e0", { cookie: alice })).statut).toBe(200);
    expect((await env.appeler("GET", "/api/wishlist", { cookie: alice })).json.cartes).toEqual([]);
  });

  it(`plafond de ${MAX_WISHLIST} cartes, même avec des ajouts simultanés`, async () => {
    const env = creerEnvironnementDeTest();
    const alice = await env.inscrire("Alice", "mot-de-passe-alice");
    const maintenant = Date.now();
    const inserer = env.bd.prepare("INSERT INTO wishlist (compte_id, card_code, ajoutee_le) VALUES (?, ?, ?)");
    for (let i = 0; i < MAX_WISHLIST - 2; i++) inserer.run(id(env, "Alice"), `faux-${i}`, maintenant);
    const codes = ["ogn-c0", "ogn-c1", "ogn-c2", "ogn-c3", "ogn-c4"];
    const reponses = await Promise.all(codes.map((code) => env.appeler("POST", "/api/wishlist", { cookie: alice, corps: { code } })));
    expect(reponses.filter((r) => r.statut === 201)).toHaveLength(2);
    expect(reponses.filter((r) => r.json.erreur === "wishlist_pleine")).toHaveLength(3);
    expect(env.bd.prepare("SELECT COUNT(*) AS n FROM wishlist").get()).toEqual({ n: MAX_WISHLIST });
  });

  it("apparaît dans « Qui a ? » au marché, disparaît quand l'auteur obtient la carte", async () => {
    const env = creerEnvironnementDeTest();
    const alice = await env.inscrire("Alice", "mot-de-passe-alice");
    const bob = await env.inscrire("Bob", "mot-de-passe-bob");
    donner(env, "Bob", "ogn-e0", 2);
    await env.appeler("POST", "/api/wishlist", { cookie: alice, corps: { code: "ogn-e0" } });

    const vues = await wishlists(env, bob);
    expect(vues).toHaveLength(1);
    expect(vues[0]).toMatchObject({ auteur: "Alice", estMoi: false, jePossede: 2, carte: { code: "ogn-e0" } });
    expect((await wishlists(env, alice))[0]?.estMoi).toBe(true);
    // Rien n'est publié dans le salon (pas de spam).
    expect((await env.appeler("GET", "/api/marche/salon", { cookie: bob })).json.messages).toEqual([]);

    donner(env, "Alice", "ogn-e0", 1);
    expect(await wishlists(env, bob)).toHaveLength(0);
  });

  it("pas de doublon avec une annonce « Qui a ? » du même joueur pour la même carte", async () => {
    const env = creerEnvironnementDeTest();
    const alice = await env.inscrire("Alice", "mot-de-passe-alice");
    await env.appeler("POST", "/api/wishlist", { cookie: alice, corps: { code: "ogn-e1" } });
    await env.appeler("POST", "/api/marche/annonces", { cookie: alice, corps: { type: "cherche", code: "ogn-e1", foil: false } });
    expect(await wishlists(env, alice)).toHaveLength(0);
  });
});
