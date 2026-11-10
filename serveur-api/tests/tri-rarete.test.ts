/** Tri par rareté (croissante ou décroissante) du catalogue, de ma collection et de celle d'un autre joueur. */
import { beforeEach, describe, expect, it } from "vitest";
import { rangRarete } from "../catalogue/classification-cartes";
import { amorcerCataloguePourTest, viderCacheMemoire } from "../catalogue/source-cartes";
import { catalogueDeTest } from "./outils/catalogue-de-test";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

type Carte = { code: string; rarete: string; variante: string; type: string };

beforeEach(() => {
  viderCacheMemoire();
  amorcerCataloguePourTest(catalogueDeTest());
});

const rangs = (cartes: Carte[]) => cartes.map((c) => rangRarete(c as Parameters<typeof rangRarete>[0]));
const croissant = (l: number[]) => l.every((v, i) => i === 0 || (l[i - 1] ?? 0) <= v);

describe("Tri par rareté", () => {
  it("rang : Ultime > Special > Signée > Overnumbered > Alt Art > Epic > Rare > Uncommon > Common > rune", () => {
    const r = (variante: string, rarete = "Showcase", type = "Unit") => rangRarete({ variante, rarete, type } as Parameters<typeof rangRarete>[0]);
    const ordre = [r("ultime", "Epic"), r("special"), r("signee"), r("overnumbered"), r("alt"), r("base", "Epic"), r("base", "Rare"), r("base", "Uncommon"), r("base", "Common"), r("base", "Common", "Rune")];
    expect([...ordre].sort((a, b) => b - a)).toEqual(ordre);
    expect(new Set(ordre).size).toBe(ordre.length);
  });

  it("catalogue : décroissant, croissant, et ordre du catalogue gardé à rareté égale ; tri inconnu refusé", async () => {
    const env = creerEnvironnementDeTest();
    const alice = await env.inscrire("Alice", "mot-de-passe-alice");
    const lire = async (tri: string) => (await env.appeler("GET", `/api/catalogue/cartes?set=unl&${tri}`, { cookie: alice })).json.cartes as Carte[];

    const desc = await lire("tri=rarete-desc");
    expect(desc[0]?.code).toBe("unl-ult0");
    expect(croissant(rangs(desc).reverse())).toBe(true);
    const asc = await lire("tri=rarete-asc");
    expect(croissant(rangs(asc))).toBe(true);
    expect(asc.at(-1)?.code).toBe("unl-ult0");
    // À rareté égale, l'ordre du catalogue (numéro) est conservé.
    expect(asc.filter((c) => c.variante === "base" && c.rarete === "Common").map((c) => c.code).slice(0, 3)).toEqual(["unl-c0", "unl-c1", "unl-c2"]);
    expect((await env.appeler("GET", "/api/catalogue/cartes?tri=prix", { cookie: alice })).statut).toBe(400);
  });

  it("catalogue : manquantes=1 ne garde que les cartes que je n'ai pas (normale ni foil)", async () => {
    const env = creerEnvironnementDeTest();
    const alice = await env.inscrire("Alice", "mot-de-passe-alice");
    const id = (env.bd.prepare("SELECT id FROM comptes WHERE pseudo = 'Alice'").get() as { id: number }).id;
    env.bd.prepare("INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, 'ven-c0', 0, 1), (?, 'ven-alt0', 1, 1)").run(id, id);
    const lire = async (q: string) => (await env.appeler("GET", `/api/catalogue/cartes?set=ven&${q}`, { cookie: alice })).json as { total: number; cartes: Carte[] };
    const toutes = await lire("");
    const manquantes = await lire("manquantes=1");
    expect(manquantes.total).toBe(toutes.total - 2);
    expect(manquantes.cartes.some((c) => c.code === "ven-c0" || c.code === "ven-alt0")).toBe(false);
  });

  it("collections (la mienne et celle d'un autre) triées de la même façon", async () => {
    const env = creerEnvironnementDeTest();
    const alice = await env.inscrire("Alice", "mot-de-passe-alice");
    await env.inscrire("Bob", "mot-de-passe-bob");
    const bob = (env.bd.prepare("SELECT id FROM comptes WHERE pseudo = 'Bob'").get() as { id: number }).id;
    for (const code of ["ogn-c0", "ogn-alt0", "ogn-e0", "ogn-sig0", "ogn-r0"]) {
      env.bd.prepare("INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, ?, 0, 1)").run(bob, code);
    }
    const r = await env.appeler("GET", "/api/collection/joueur/Bob?tri=rarete-desc", { cookie: alice });
    expect((r.json.cartes as Carte[]).map((c) => c.code)).toEqual(["ogn-sig0", "ogn-alt0", "ogn-e0", "ogn-r0", "ogn-c0"]);
  });
});
