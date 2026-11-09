/** Tests des échanges entre joueurs : règles, droits, atomicité (aucune carte créée ni perdue), expiration. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { amorcerCataloguePourTest, viderCacheMemoire } from "../catalogue/source-cartes";
import { MAX_PROPOSITIONS_EN_ATTENTE } from "../echanges/regles-echanges";
import { catalogueDeTest } from "./outils/catalogue-de-test";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

type Env = ReturnType<typeof creerEnvironnementDeTest>;
type Echange = { id: number; statut: string; auteur: string; destinataire: string; donne: unknown[]; demande: unknown[] };
type Listes = { recues: Echange[]; envoyees: Echange[]; historique: Echange[] };

beforeEach(() => {
  viderCacheMemoire();
  amorcerCataloguePourTest(catalogueDeTest());
});
afterEach(() => vi.useRealTimers());

function id(env: Env, pseudo: string): number {
  return (env.bd.prepare("SELECT id FROM comptes WHERE pseudo = ?").get(pseudo) as { id: number }).id;
}

function donner(env: Env, pseudo: string, code: string, quantite: number, foil: 0 | 1 = 0): void {
  env.bd
    .prepare(
      `INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, ?, ?, ?)
       ON CONFLICT (compte_id, card_code, est_foil) DO UPDATE SET quantite = quantite + excluded.quantite`,
    )
    .run(id(env, pseudo), code, foil, quantite);
}

function quantite(env: Env, pseudo: string, code: string, foil: 0 | 1 = 0): number {
  const ligne = env.bd
    .prepare("SELECT quantite FROM collection WHERE compte_id = ? AND card_code = ? AND est_foil = ?")
    .get(id(env, pseudo), code, foil) as { quantite: number } | undefined;
  return ligne?.quantite ?? 0;
}

/** Alice et Bob inscrits, collections vidées (l'inscription ne donne que des boosters, pas de cartes). */
async function deuxJoueurs() {
  const env = creerEnvironnementDeTest();
  const alice = await env.inscrire("Alice", "motdepasse");
  const bob = await env.inscrire("Bob", "motdepasse");
  donner(env, "Alice", "ogn-c0", 3);
  donner(env, "Alice", "ogn-r0", 1, 1); // une Rare foil
  donner(env, "Bob", "ogn-e0", 1); // une Épique
  donner(env, "Bob", "ogn-c1", 2);
  return { env, alice, bob };
}

const proposition = (extra: Record<string, unknown> = {}) => ({
  destinataire: "Bob",
  donne: [{ code: "ogn-c0", foil: false, quantite: 2 }],
  demande: [{ code: "ogn-e0", foil: false, quantite: 1 }],
  ...extra,
});

async function proposer(env: Env, cookie: string, corps: unknown = proposition()) {
  return env.appeler("POST", "/api/echanges", { cookie, corps });
}

describe("Créer une proposition", () => {
  it("crée la proposition, visible en « envoyées » pour l'auteur et « reçues » pour le destinataire", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    const r = await proposer(env, alice, proposition({ message: "Ton Épique contre 2 communes ?" }));
    expect(r.statut).toBe(201);

    const vueAlice = (await env.appeler("GET", "/api/echanges", { cookie: alice })).json as unknown as Listes;
    const vueBob = (await env.appeler("GET", "/api/echanges", { cookie: bob })).json as unknown as Listes;
    expect(vueAlice.envoyees).toHaveLength(1);
    expect(vueBob.recues).toHaveLength(1);
    expect(vueBob.recues[0]?.auteur).toBe("Alice");
    expect((await env.appeler("GET", "/api/echanges/resume", { cookie: bob })).json.recuesEnAttente).toBe(1);
    // Rien n'a bougé tant que ce n'est pas accepté.
    expect(quantite(env, "Alice", "ogn-c0")).toBe(3);
  });

  it("refuse si je ne possède pas les cartes que je donne (y compris foil vs normale)", async () => {
    const { env, alice } = await deuxJoueurs();
    const trop = await proposer(env, alice, proposition({ donne: [{ code: "ogn-c0", foil: false, quantite: 4 }] }));
    expect(trop.statut).toBe(409);
    expect(trop.json.cote).toBe("donne");
    const mauvaisFoil = await proposer(env, alice, proposition({ donne: [{ code: "ogn-c0", foil: true, quantite: 1 }] }));
    expect(mauvaisFoil.statut).toBe(409);
  });

  it("refuse si l'autre joueur ne possède pas les cartes demandées", async () => {
    const { env, alice } = await deuxJoueurs();
    const r = await proposer(env, alice, proposition({ demande: [{ code: "ogn-e0", foil: false, quantite: 2 }] }));
    expect(r.statut).toBe(409);
    expect(r.json.cote).toBe("demande");
  });

  it("refuse un échange vide, avec soi-même ou avec un joueur inconnu", async () => {
    const { env, alice } = await deuxJoueurs();
    expect((await proposer(env, alice, proposition({ donne: [], demande: [] }))).statut).toBe(400);
    expect((await proposer(env, alice, proposition({ destinataire: "Alice" }))).statut).toBe(400);
    expect((await proposer(env, alice, proposition({ destinataire: "Personne" }))).statut).toBe(404);
  });

  it("refuse les données invalides : doublon, quantité nulle, message trop long, champ inconnu", async () => {
    const { env, alice } = await deuxJoueurs();
    const ligne = { code: "ogn-c0", foil: false, quantite: 1 };
    for (const corps of [
      proposition({ donne: [ligne, ligne] }),
      proposition({ donne: [{ ...ligne, quantite: 0 }] }),
      proposition({ message: "x".repeat(201) }),
      proposition({ statut: "accepte" }),
      proposition({ donne: [{ ...ligne, code: "<script>" }] }),
    ]) {
      expect((await proposer(env, alice, corps)).statut).toBe(400);
    }
  });

  it(`limite à ${MAX_PROPOSITIONS_EN_ATTENTE} propositions en attente par joueur`, async () => {
    const { env, alice } = await deuxJoueurs();
    const don = proposition({ donne: [{ code: "ogn-c0", foil: false, quantite: 1 }], demande: [] });
    for (let i = 0; i < MAX_PROPOSITIONS_EN_ATTENTE; i++) expect((await proposer(env, alice, don)).statut).toBe(201);
    expect((await proposer(env, alice, don)).statut).toBe(429);
  });
});

describe("Accepter", () => {
  it("échange les cartes dans les deux sens, foil compris", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    const { json } = await proposer(
      env,
      alice,
      proposition({ donne: [{ code: "ogn-c0", foil: false, quantite: 2 }, { code: "ogn-r0", foil: true, quantite: 1 }] }),
    );
    const r = await env.appeler("POST", `/api/echanges/${String(json.id)}/accepter`, { cookie: bob, corps: {} });
    expect(r.statut).toBe(200);

    expect(quantite(env, "Alice", "ogn-c0")).toBe(1);
    expect(quantite(env, "Alice", "ogn-r0", 1)).toBe(0);
    expect(quantite(env, "Alice", "ogn-e0")).toBe(1);
    expect(quantite(env, "Bob", "ogn-c0")).toBe(2);
    expect(quantite(env, "Bob", "ogn-r0", 1)).toBe(1); // reste foil
    expect(quantite(env, "Bob", "ogn-e0")).toBe(0);
    // Aucune ligne à 0 ne traîne dans les collections.
    expect(env.bd.prepare("SELECT COUNT(*) AS n FROM collection WHERE quantite = 0").get()).toEqual({ n: 0 });

    const historique = (await env.appeler("GET", "/api/echanges", { cookie: alice })).json as unknown as Listes;
    expect(historique.historique[0]?.statut).toBe("accepte");
  });

  it("permet les dons (rien demandé en retour)", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    const { json } = await proposer(env, alice, proposition({ demande: [] }));
    expect((await env.appeler("POST", `/api/echanges/${String(json.id)}/accepter`, { cookie: bob, corps: {} })).statut).toBe(200);
    expect(quantite(env, "Bob", "ogn-c0")).toBe(2);
    expect(quantite(env, "Bob", "ogn-e0")).toBe(1); // Bob n'a rien donné
  });

  it("seul le destinataire peut accepter", async () => {
    const { env, alice } = await deuxJoueurs();
    const charlie = await env.inscrire("Charlie", "motdepasse");
    const { json } = await proposer(env, alice);
    expect((await env.appeler("POST", `/api/echanges/${String(json.id)}/accepter`, { cookie: alice, corps: {} })).statut).toBe(404);
    expect((await env.appeler("POST", `/api/echanges/${String(json.id)}/accepter`, { cookie: charlie, corps: {} })).statut).toBe(404);
    expect(quantite(env, "Alice", "ogn-c0")).toBe(3);
  });

  it("un échange ne peut pas être accepté deux fois (pas de duplication de cartes)", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    const { json } = await proposer(env, alice, proposition({ demande: [] }));
    const url = `/api/echanges/${String(json.id)}/accepter`;
    expect((await env.appeler("POST", url, { cookie: bob, corps: {} })).statut).toBe(200);
    expect((await env.appeler("POST", url, { cookie: bob, corps: {} })).statut).toBe(409);
    expect(quantite(env, "Bob", "ogn-c0")).toBe(2);
  });

  it("deux acceptations simultanées : une seule réussit", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    const { json } = await proposer(env, alice, proposition({ demande: [] }));
    const url = `/api/echanges/${String(json.id)}/accepter`;
    const resultats = await Promise.all([1, 2, 3].map(() => env.appeler("POST", url, { cookie: bob, corps: {} })));
    expect(resultats.filter((r) => r.statut === 200)).toHaveLength(1);
    expect(quantite(env, "Bob", "ogn-c0")).toBe(2);
    expect(quantite(env, "Alice", "ogn-c0")).toBe(1);
  });

  it("si une carte n'est plus disponible, RIEN ne bouge et l'échange passe en « échoué »", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    const { json } = await proposer(env, alice);
    // Entre-temps, Alice a donné ses communes à quelqu'un d'autre.
    env.bd.prepare("UPDATE collection SET quantite = 1 WHERE compte_id = ? AND card_code = 'ogn-c0'").run(id(env, "Alice"));

    const r = await env.appeler("POST", `/api/echanges/${String(json.id)}/accepter`, { cookie: bob, corps: {} });
    expect(r.statut).toBe(409);
    expect(r.json.erreur).toBe("cartes_plus_disponibles");
    // Atomicité : l'Épique de Bob n'est pas partie, Alice n'a rien reçu ni perdu.
    expect(quantite(env, "Bob", "ogn-e0")).toBe(1);
    expect(quantite(env, "Alice", "ogn-e0")).toBe(0);
    expect(quantite(env, "Alice", "ogn-c0")).toBe(1);
    expect(env.bd.prepare("SELECT statut FROM echanges WHERE id = ?").get(json.id as number)).toEqual({ statut: "echoue" });
  });

  it("refuse d'accepter une proposition expirée (48 h)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { env, alice, bob } = await deuxJoueurs();
    const { json } = await proposer(env, alice);
    vi.setSystemTime(Date.now() + 48 * 60 * 60_000 + 1);
    const r = await env.appeler("POST", `/api/echanges/${String(json.id)}/accepter`, { cookie: bob, corps: {} });
    expect(r.statut).toBe(410);
    expect(quantite(env, "Bob", "ogn-e0")).toBe(1);
    const vue = (await env.appeler("GET", "/api/echanges", { cookie: alice })).json as unknown as Listes;
    expect(vue.envoyees).toHaveLength(0);
    expect(vue.historique[0]?.statut).toBe("expire");
  });
});

describe("Refuser et annuler", () => {
  it("le destinataire refuse, l'auteur annule ; personne d'autre ne peut", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    const p1 = (await proposer(env, alice)).json.id as number;
    const p2 = (await proposer(env, alice)).json.id as number;

    expect((await env.appeler("POST", `/api/echanges/${p1}/refuser`, { cookie: alice, corps: {} })).statut).toBe(404);
    expect((await env.appeler("POST", `/api/echanges/${p1}/refuser`, { cookie: bob, corps: {} })).statut).toBe(200);
    expect((await env.appeler("POST", `/api/echanges/${p2}/annuler`, { cookie: bob, corps: {} })).statut).toBe(404);
    expect((await env.appeler("POST", `/api/echanges/${p2}/annuler`, { cookie: alice, corps: {} })).statut).toBe(200);

    // Une proposition refusée ou annulée ne peut plus être acceptée.
    expect((await env.appeler("POST", `/api/echanges/${p1}/accepter`, { cookie: bob, corps: {} })).statut).toBe(409);
    expect((await env.appeler("POST", `/api/echanges/${p2}/accepter`, { cookie: bob, corps: {} })).statut).toBe(409);
    expect(quantite(env, "Alice", "ogn-c0")).toBe(3);
  });
});

describe("Joueurs et collections des autres", () => {
  it("liste les autres joueurs actifs (pas moi, pas les comptes désactivés)", async () => {
    const { env, alice } = await deuxJoueurs();
    await env.inscrire("Charlie", "motdepasse");
    env.bd.prepare("UPDATE comptes SET actif = 0 WHERE pseudo = 'Charlie'").run();
    const r = await env.appeler("GET", "/api/echanges/joueurs", { cookie: alice });
    expect(r.json.joueurs).toEqual(["Bob"]);
  });

  it("permet de parcourir la collection d'un autre joueur, avec les filtres", async () => {
    const { env, alice } = await deuxJoueurs();
    const r = await env.appeler("GET", "/api/collection/joueur/Bob?rarete=Epic", { cookie: alice });
    expect(r.statut).toBe(200);
    expect((r.json.cartes as Array<{ code: string }>).map((c) => c.code)).toEqual(["ogn-e0"]);
    expect((await env.appeler("GET", "/api/collection/joueur/Personne", { cookie: alice })).statut).toBe(404);
    expect((await env.appeler("GET", "/api/collection/joueur/Bob")).statut).toBe(401);
  });

  it("toutes les routes d'échange exigent une connexion", async () => {
    const env = creerEnvironnementDeTest();
    expect((await env.appeler("GET", "/api/echanges")).statut).toBe(401);
    expect((await env.appeler("POST", "/api/echanges", { corps: proposition() })).statut).toBe(401);
  });
});
