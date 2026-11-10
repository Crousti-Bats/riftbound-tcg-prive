/** Nouvel échange : comparaison de ma collection et de celle de l'autre joueur (cartes que l'autre n'a pas). */
import { beforeEach, describe, expect, it } from "vitest";
import { amorcerCataloguePourTest, viderCacheMemoire } from "../catalogue/source-cartes";
import { catalogueDeTest } from "./outils/catalogue-de-test";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

type Env = ReturnType<typeof creerEnvironnementDeTest>;
type Carte = { code: string; chezAutre?: number };

beforeEach(() => {
  viderCacheMemoire();
  amorcerCataloguePourTest(catalogueDeTest());
});

function donner(env: Env, pseudo: string, code: string, quantite: number, foil: 0 | 1 = 0): void {
  const id = (env.bd.prepare("SELECT id FROM comptes WHERE pseudo = ?").get(pseudo) as { id: number }).id;
  env.bd.prepare("INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, ?, ?, ?)").run(id, code, foil, quantite);
}

async function preparer() {
  const env = creerEnvironnementDeTest();
  const alice = await env.inscrire("Alice", "mot-de-passe-alice");
  await env.inscrire("Bob", "mot-de-passe-bob");
  donner(env, "Alice", "ogn-c0", 2);
  donner(env, "Alice", "ogn-e0", 1);
  donner(env, "Alice", "ogn-alt0", 1, 1);
  donner(env, "Bob", "ogn-c0", 1);
  donner(env, "Bob", "ogn-alt0", 1); // normale chez Bob, foil chez Alice : il l'a quand même
  donner(env, "Bob", "ogn-r0", 3);
  return { env, alice };
}
const lire = async (env: Env, cookie: string, chemin: string) => (await env.appeler("GET", chemin, { cookie })).json.cartes as Carte[];

describe("Comparaison des collections pour un échange", () => {
  it("ma collection : combien l'autre en a, et seulement celles qu'il n'a pas", async () => {
    const { env, alice } = await preparer();
    const toutes = await lire(env, alice, "/api/collection?comparer=Bob");
    expect(Object.fromEntries(toutes.map((c) => [c.code, c.chezAutre]))).toEqual({ "ogn-c0": 1, "ogn-e0": 0, "ogn-alt0": 1 });
    expect((await lire(env, alice, "/api/collection?comparer=Bob&manquantes=1")).map((c) => c.code)).toEqual(["ogn-e0"]);
  });

  it("collection de l'autre : seulement celles que je n'ai pas", async () => {
    const { env, alice } = await preparer();
    const manquantes = await lire(env, alice, "/api/collection/joueur/Bob?comparer=1&manquantes=1");
    expect(manquantes.map((c) => c.code)).toEqual(["ogn-r0"]);
    expect(manquantes[0]?.chezAutre).toBe(0);
  });

  it("sans comparaison, rien ne change ; joueur inconnu ou invalide → 404", async () => {
    const { env, alice } = await preparer();
    const normale = await lire(env, alice, "/api/collection?manquantes=1");
    expect(normale).toHaveLength(3);
    expect(normale[0]?.chezAutre).toBeUndefined();
    expect((await env.appeler("GET", "/api/collection?comparer=Personne", { cookie: alice })).statut).toBe(404);
    expect((await env.appeler("GET", "/api/collection?comparer=%27%20OR%201%3D1", { cookie: alice })).statut).toBe(404);
  });
});
