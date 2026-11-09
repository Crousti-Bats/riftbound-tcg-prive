/** Tests des routes /api/collection (liste des cartes possédées et résumé de complétion). */
import { beforeEach, describe, expect, it } from "vitest";
import { amorcerCataloguePourTest, viderCacheMemoire } from "../catalogue/source-cartes";
import { catalogueDeTest } from "./outils/catalogue-de-test";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

type Carte = { code: string; set: string; rarete: string; quantite: number; quantiteFoil: number };
type ListeCollection = { cartes: Carte[]; total: number; page: number; parPage: number };
type ResumeCollection = {
  totalCartes: number;
  cartesDistinctes: number;
  parSet: Array<{ code: string; nom: string; possedees: number; total: number }>;
};

beforeEach(() => {
  viderCacheMemoire();
  amorcerCataloguePourTest(catalogueDeTest());
});

function idCompte(bd: ReturnType<typeof creerEnvironnementDeTest>["bd"], pseudo: string): number {
  return (bd.prepare("SELECT id FROM comptes WHERE pseudo = ?").get(pseudo) as { id: number }).id;
}

function ajouter(
  bd: ReturnType<typeof creerEnvironnementDeTest>["bd"],
  compteId: number,
  code: string,
  foil: 0 | 1,
  quantite: number,
): void {
  bd.prepare("INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, ?, ?, ?)").run(
    compteId,
    code,
    foil,
    quantite,
  );
}

describe("API /api/collection — liste", () => {
  it("renvoie les cartes possédées avec leurs quantités (normale et foil séparées)", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idCompte(env.bd, "Alice");
    ajouter(env.bd, id, "ogn-c0", 0, 3);
    ajouter(env.bd, id, "ogn-c0", 1, 1); // même carte en foil
    ajouter(env.bd, id, "ogn-e0", 0, 1);

    const r = await env.appeler("GET", "/api/collection", { cookie });
    expect(r.statut).toBe(200);
    const liste = r.json as unknown as ListeCollection;
    expect(liste.total).toBe(2); // 2 cartes distinctes
    const c0 = liste.cartes.find((c) => c.code === "ogn-c0");
    expect(c0?.quantite).toBe(3);
    expect(c0?.quantiteFoil).toBe(1);
  });

  it("filtre par set, rareté et recherche", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idCompte(env.bd, "Alice");
    ajouter(env.bd, id, "ogn-c0", 0, 1);
    ajouter(env.bd, id, "ogn-e0", 0, 1);
    ajouter(env.bd, id, "sfd-c0", 0, 1);

    const parSet = (await env.appeler("GET", "/api/collection?set=ogn", { cookie })).json as unknown as ListeCollection;
    expect(parSet.cartes.every((c) => c.set === "ogn")).toBe(true);
    expect(parSet.total).toBe(2);

    const parRarete = (await env.appeler("GET", "/api/collection?rarete=Epic", { cookie }))
      .json as unknown as ListeCollection;
    expect(parRarete.total).toBe(1);
    expect(parRarete.cartes[0]?.code).toBe("ogn-e0");

    const parRecherche = (await env.appeler("GET", "/api/collection?recherche=ogn-e0", { cookie }))
      .json as unknown as ListeCollection;
    expect(parRecherche.total).toBe(1);
  });

  it("bascule foil : ne garde que les cartes possédées en foil", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idCompte(env.bd, "Alice");
    ajouter(env.bd, id, "ogn-c0", 0, 2); // normale seulement
    ajouter(env.bd, id, "ogn-e0", 1, 1); // foil

    const r = (await env.appeler("GET", "/api/collection?foil=1", { cookie })).json as unknown as ListeCollection;
    expect(r.total).toBe(1);
    expect(r.cartes[0]?.code).toBe("ogn-e0");
  });

  it("bascule doublons : ne garde que les cartes en plusieurs exemplaires", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idCompte(env.bd, "Alice");
    ajouter(env.bd, id, "ogn-c0", 0, 1); // unique
    ajouter(env.bd, id, "ogn-c1", 0, 1);
    ajouter(env.bd, id, "ogn-c1", 1, 1); // 1 normale + 1 foil = doublon

    const r = (await env.appeler("GET", "/api/collection?doublons=1", { cookie })).json as unknown as ListeCollection;
    expect(r.total).toBe(1);
    expect(r.cartes[0]?.code).toBe("ogn-c1");
  });

  it("refuse l'accès sans connexion (401)", async () => {
    const env = creerEnvironnementDeTest();
    expect((await env.appeler("GET", "/api/collection", {})).statut).toBe(401);
    expect((await env.appeler("GET", "/api/collection/resume", {})).statut).toBe(401);
  });
});

describe("API /api/collection/resume — complétion", () => {
  it("calcule les totaux et la complétion par set (cartes de base)", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idCompte(env.bd, "Alice");
    ajouter(env.bd, id, "ogn-c0", 0, 2);
    ajouter(env.bd, id, "ogn-c1", 0, 1);
    ajouter(env.bd, id, "ogn-alt0", 0, 1); // variante alt → ne compte pas dans la complétion de base

    const r = await env.appeler("GET", "/api/collection/resume", { cookie });
    expect(r.statut).toBe(200);
    const resume = r.json as unknown as ResumeCollection;
    expect(resume.totalCartes).toBe(4); // 2 + 1 + 1
    expect(resume.cartesDistinctes).toBe(3);

    const ogn = resume.parSet.find((s) => s.code === "ogn");
    const totalBaseOgn = catalogueDeTest().sets.find((s) => s.code === "ogn")?.parVariante.base ?? 0;
    expect(ogn?.possedees).toBe(2); // ogn-c0 et ogn-c1 (base) ; ogn-alt0 exclu
    expect(ogn?.total).toBe(totalBaseOgn);
  });
});
