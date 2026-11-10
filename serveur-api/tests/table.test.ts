/** Tests de la table de jeu : moteur (mise en place, actions, informations cachées) et salon /api/parties. */
import { beforeEach, describe, expect, it } from "vitest";
import { amorcerCataloguePourTest, viderCacheMemoire } from "../catalogue/source-cartes";
import {
  type ActionTable,
  type CarteVue,
  type DeckDeTable,
  type EtatTable,
  type IndexJoueur,
  appliquerAction,
  creerPartie,
  idZone,
  vuePour,
} from "../table/moteur-table";
import { schemaAction } from "../table/schema-action";
import { DECKS_DEMO, type DeckDemo } from "../decks/decks-demo";
import { MAX_PARTIES_OUVERTES } from "../table/routes-parties";
import { CARTES, catalogueDecks, deckValide } from "./outils/catalogue-decks-de-test";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

/** Aléatoire déterministe (pas de test instable). */
function aleatoireSeede(graine = 42) {
  let x = graine;
  return () => {
    x = (x * 1664525 + 1013904223) % 2 ** 32;
    return x / 2 ** 32;
  };
}

const DECK: DeckDeTable = {
  legende: "leg-ekko",
  champion: "ch-ekko",
  principal: Array.from({ length: 13 }, (_, i) => Array<string>(3).fill(`un-${i}`)).flat(),
  runes: [...Array<string>(6).fill("rune-fury"), ...Array<string>(6).fill("rune-mind")],
  terrains: ["bf0", "bf1", "bf2"],
};

function partie(): EtatTable {
  return creerPartie("ABCD2345", [{ id: 1, pseudo: "Alice", deck: DECK }, { id: 2, pseudo: "Bob", deck: DECK }], aleatoireSeede(), 1000, ["ogn-271-298", "unl-t05"]);
}

/** Comme la salle : l'action passe d'abord par le schéma (validation, nettoyage du texte). */
function jouer(etat: EtatTable, j: IndexJoueur, action: ActionTable) {
  return appliquerAction(etat, j, schemaAction.parse(action), aleatoireSeede(7), 2000);
}

const cartesDe = (etat: EtatTable, zone: string) => etat.zones[zone] ?? [];
const vueZone = (etat: EtatTable, moi: IndexJoueur | null, zone: string) => vuePour(etat, moi).zones[zone];

describe("Table de jeu : mise en place", () => {
  it("place Légende, champion, champs de bataille, decks mélangés et 4 cartes en main", () => {
    const etat = partie();
    for (const j of [0, 1] as const) {
      expect(cartesDe(etat, idZone(j, "legende"))).toHaveLength(1);
      expect(cartesDe(etat, idZone(j, "champion"))).toHaveLength(1);
      // Un champ de bataille tiré au sort est posé sur la table (champ.0 pour le joueur 0, champ.1 pour le 1).
      expect(cartesDe(etat, idZone(j, "terrains"))).toHaveLength(2);
      expect(cartesDe(etat, `champ.${j}`)).toHaveLength(1);
      expect(etat.cartes[cartesDe(etat, `champ.${j}`)[0] as string]?.code).toMatch(/^bf[012]$/);
      expect(cartesDe(etat, idZone(j, "main"))).toHaveLength(4);
      expect(cartesDe(etat, idZone(j, "deck"))).toHaveLength(39 - 4);
      expect(cartesDe(etat, idZone(j, "runes"))).toHaveLength(12);
    }
    expect(etat.journal[0]?.texte).toMatch(/^Partie lancée\. (Alice|Bob) commence\. .* canalise 3 runes à son premier tour au lieu de 2\.$/);
  });

  it("garde secrètes la main de l'adversaire et l'ordre des decks", () => {
    const etat = partie();
    const maMain = vueZone(etat, 0, "0.main") as CarteVue[];
    expect(maMain).toHaveLength(4);
    expect(maMain.every((c) => c.code !== null)).toBe(true);
    expect(vueZone(etat, 0, "1.main")).toBe(4);
    expect(vueZone(etat, 0, "0.deck")).toBe(35);
    expect(vueZone(etat, 0, "1.runes")).toBe(12);
    expect((vueZone(etat, 1, "0.legende") as CarteVue[])[0]?.code).toBe("leg-ekko");
    // Rien de caché ne fuit dans la vue sérialisée (pas de code de la main adverse).
    const texte = JSON.stringify(vuePour(etat, 1));
    for (const id of cartesDe(etat, "0.main")) expect(texte).not.toContain(`"${id}"`);
  });
});

describe("Table de jeu : actions", () => {
  it("pioche et canalise (les runes canalisées sont publiques)", () => {
    const etat = partie();
    expect(jouer(etat, 0, { type: "piocher", n: 2 })).toEqual({ ok: true });
    expect(cartesDe(etat, "0.main")).toHaveLength(6);
    expect(jouer(etat, 0, { type: "canaliser", n: 2 })).toEqual({ ok: true });
    const reserve = vueZone(etat, 1, "0.reserve") as CarteVue[];
    expect(reserve).toHaveLength(2);
    expect(reserve.every((c) => c.code?.startsWith("rune-"))).toBe(true);
    expect(etat.journal.at(-1)?.texte).toBe("Alice canalise {0}, {1}.");
  });

  it("joue une carte de la main vers la base, visible de tous", () => {
    const etat = partie();
    const id = cartesDe(etat, "0.main")[0] as string;
    expect(jouer(etat, 0, { type: "deplacer", carte: id, vers: "0.base" })).toEqual({ ok: true });
    const vue = vueZone(etat, 1, "0.base") as CarteVue[];
    expect(vue[0]?.code).toBe(etat.cartes[id]?.code);
    expect(etat.journal.at(-1)).toMatchObject({ texte: "Alice déplace {0} vers sa base.", cartes: [etat.cartes[id]?.code] });
  });

  it("joue face cachée : seul le propriétaire voit la carte, jusqu'à ce qu'il la retourne", () => {
    const etat = partie();
    const id = cartesDe(etat, "0.main")[0] as string;
    jouer(etat, 0, { type: "deplacer", carte: id, vers: "champ.0", cachee: true });
    expect((vueZone(etat, 1, "champ.0") as CarteVue[]).at(-1)?.code).toBeNull();
    expect((vueZone(etat, 0, "champ.0") as CarteVue[]).at(-1)?.code).toBe(etat.cartes[id]?.code);
    expect(etat.journal.at(-1)?.cartes).toBeUndefined();
    expect(jouer(etat, 1, { type: "retourner", carte: id })).toEqual({ ok: false, erreur: "carte_interdite" });
    jouer(etat, 0, { type: "retourner", carte: id });
    expect((vueZone(etat, 1, "champ.0") as CarteVue[]).at(-1)?.code).toBe(etat.cartes[id]?.code);
  });

  it("l'adversaire ne touche pas à ma main, mais peut détruire ma carte en jeu vers MA défausse", () => {
    const etat = partie();
    const [enMain, joue] = cartesDe(etat, "0.main") as [string, string];
    expect(jouer(etat, 1, { type: "deplacer", carte: enMain, vers: "0.defausse" })).toEqual({ ok: false, erreur: "carte_interdite" });
    jouer(etat, 0, { type: "deplacer", carte: joue, vers: "champ.1" });
    expect(jouer(etat, 1, { type: "deplacer", carte: joue, vers: "1.defausse" })).toEqual({ ok: false, erreur: "zone_interdite" });
    expect(jouer(etat, 1, { type: "incliner", carte: joue })).toEqual({ ok: true });
    expect(jouer(etat, 1, { type: "deplacer", carte: joue, vers: "0.defausse" })).toEqual({ ok: true });
    expect(cartesDe(etat, "0.defausse")).toEqual([joue]);
    expect(etat.cartes[joue]?.inclinee).toBe(false);
    expect(etat.journal.at(-1)?.texte).toBe("Bob (carte de Alice) déplace {0} vers sa défausse.");
  });

  it("remet une carte sur ou sous le deck, face cachée, sans révéler laquelle", () => {
    const etat = partie();
    const [a, b] = cartesDe(etat, "0.main") as [string, string];
    jouer(etat, 0, { type: "deplacer", carte: a, vers: "0.deck", position: "dessus" });
    jouer(etat, 0, { type: "deplacer", carte: b, vers: "0.deck", position: "dessous" });
    expect(cartesDe(etat, "0.deck")[0]).toBe(a);
    expect(cartesDe(etat, "0.deck").at(-1)).toBe(b);
    expect(etat.cartes[a]?.face).toBe(false);
    expect(etat.journal.at(-1)?.texte).toBe("Alice déplace une carte cachée de sa main sous son deck.");
  });

  it("incline, pose des marqueurs, redresse tout ; quitter le jeu remet à zéro", () => {
    const etat = partie();
    const id = cartesDe(etat, "0.main")[0] as string;
    jouer(etat, 0, { type: "deplacer", carte: id, vers: "0.base" });
    jouer(etat, 0, { type: "incliner", carte: id });
    jouer(etat, 0, { type: "marqueur", carte: id, delta: 2 });
    expect(etat.cartes[id]).toMatchObject({ inclinee: true, marqueurs: 2 });
    jouer(etat, 0, { type: "redresser" });
    expect(etat.cartes[id]?.inclinee).toBe(false);
    jouer(etat, 0, { type: "deplacer", carte: id, vers: "0.main" });
    expect(etat.cartes[id]?.marqueurs).toBe(0);
  });

  it("mulligan : jusqu'à 2 cartes sous le deck, autant de piochées, une seule fois", () => {
    const etat = partie();
    const [a, b] = cartesDe(etat, "0.main") as [string, string];
    expect(jouer(etat, 0, { type: "mulligan", cartes: [a, b] })).toEqual({ ok: true });
    expect(cartesDe(etat, "0.main")).toHaveLength(4);
    expect(cartesDe(etat, "0.main")).not.toContain(a);
    expect(cartesDe(etat, "0.deck").slice(-2)).toEqual([a, b]);
    expect(jouer(etat, 0, { type: "mulligan", cartes: [] })).toEqual({ ok: false, erreur: "mulligan_deja_fait" });
    expect(jouer(etat, 1, { type: "mulligan", cartes: [a] })).toEqual({ ok: false, erreur: "carte_interdite" });
  });

  it("compte les points (jamais négatifs), révèle, lance un dé, discute", () => {
    const etat = partie();
    jouer(etat, 1, { type: "points", delta: 3 });
    jouer(etat, 1, { type: "points", delta: -5 });
    expect(etat.joueurs[1].points).toBe(0);
    const id = cartesDe(etat, "1.main")[0] as string;
    jouer(etat, 1, { type: "reveler", carte: id });
    expect(etat.journal.at(-1)).toMatchObject({ texte: "Bob révèle {0} de sa main.", cartes: [etat.cartes[id]?.code] });
    jouer(etat, 0, { type: "de" });
    expect(etat.journal.at(-1)?.texte).toMatch(/^Alice lance un dé : [1-6]\.$/);
    jouer(etat, 0, { type: "dire", texte: "  bien joué  " });
    expect(etat.journal.at(-1)?.texte).toBe("Alice : bien joué");
  });

  it("crée des tokens du jeu ou libres, chez moi ou sur un champ de bataille, jamais chez l'adversaire", () => {
    const etat = partie();
    expect(jouer(etat, 0, { type: "creerToken", code: "ogn-271-298", vers: "0.base", n: 2 })).toEqual({ ok: true });
    const base = vueZone(etat, 1, "0.base") as CarteVue[];
    expect(base.map((c) => [c.code, c.token])).toEqual([["ogn-271-298", true], ["ogn-271-298", true]]);
    expect(etat.journal.at(-1)).toMatchObject({ texte: "Alice crée 2 × {0} (sa base).", cartes: ["ogn-271-298"] });
    // Les nouveaux identifiants ne réutilisent jamais ceux des cartes existantes.
    expect(new Set(Object.keys(etat.cartes)).size).toBe(Object.keys(etat.cartes).length);

    expect(jouer(etat, 1, { type: "creerToken", libelle: "Bomb", vers: "champ.1", n: 1 })).toEqual({ ok: true });
    expect((vueZone(etat, 0, "champ.1") as CarteVue[]).at(-1)).toMatchObject({ code: null, libelle: "Bomb", token: true, proprio: 1 });

    expect(jouer(etat, 0, { type: "creerToken", code: "zzz-999", vers: "0.base", n: 1 })).toEqual({ ok: false, erreur: "token_inconnu" });
    expect(jouer(etat, 0, { type: "creerToken", vers: "0.base", n: 1 })).toEqual({ ok: false, erreur: "token_inconnu" });
    expect(jouer(etat, 0, { type: "creerToken", libelle: "Bomb", vers: "1.base", n: 1 })).toEqual({ ok: false, erreur: "zone_interdite" });
    expect(jouer(etat, 0, { type: "creerToken", libelle: "Bomb", vers: "0.main", n: 1 })).toEqual({ ok: false, erreur: "zone_interdite" });
  });

  it("un token qui quitte le jeu disparaît, même détruit par l'adversaire", () => {
    const etat = partie();
    jouer(etat, 0, { type: "creerToken", libelle: "Bomb", vers: "champ.0", n: 1 });
    const id = cartesDe(etat, "champ.0").at(-1) as string;
    jouer(etat, 0, { type: "incliner", carte: id });
    expect(jouer(etat, 1, { type: "deplacer", carte: id, vers: "0.defausse" })).toEqual({ ok: true });
    expect(etat.cartes[id]).toBeUndefined();
    expect(cartesDe(etat, "0.defausse")).toEqual([]);
    expect(etat.journal.at(-1)?.texte).toBe("Bob retire le token Bomb.");
    // Rester en jeu (base → champ de bataille) ne le fait pas disparaître.
    jouer(etat, 0, { type: "creerToken", code: "unl-t05", vers: "0.base", n: 1 });
    const gold = cartesDe(etat, "0.base")[0] as string;
    jouer(etat, 0, { type: "deplacer", carte: gold, vers: "champ.1" });
    expect(cartesDe(etat, "champ.1").at(-1)).toBe(gold);
  });

  it("refuse les actions mal formées", () => {
    expect(schemaAction.safeParse({ type: "piocher", n: 50 }).success).toBe(false);
    expect(schemaAction.safeParse({ type: "deplacer", carte: "c1", vers: "2.main" }).success).toBe(false);
    expect(schemaAction.safeParse({ type: "dire", texte: "x".repeat(201) }).success).toBe(false);
    expect(schemaAction.safeParse({ type: "pirater" }).success).toBe(false);
  });
});

describe("Table de jeu : aide automatique", () => {
  it("début de tour : redresse, canalise 2 (3 au premier tour du second joueur), pioche 1, marque les champs tenus", () => {
    const etat = partie();
    const second = (1 - etat.premier) as IndexJoueur;
    expect(jouer(etat, second, { type: "debutTour" })).toEqual({ ok: true });
    expect(cartesDe(etat, idZone(second, "reserve"))).toHaveLength(3);
    expect(cartesDe(etat, idZone(second, "main"))).toHaveLength(5);
    jouer(etat, second, { type: "debutTour" });
    expect(cartesDe(etat, idZone(second, "reserve"))).toHaveLength(5);
    // Une unité seule sur le champ 1 : il est tenu, +1 point au tour suivant. Tout est redressé.
    const unite = cartesDe(etat, idZone(second, "main"))[0] as string;
    jouer(etat, second, { type: "deplacer", carte: unite, vers: "champ.0" });
    jouer(etat, second, { type: "incliner", carte: unite });
    jouer(etat, second, { type: "debutTour" });
    expect(etat.joueurs[second].points).toBe(1);
    expect(etat.cartes[unite]?.inclinee).toBe(false);
    expect(etat.journal.at(-1)?.texte).toMatch(/tient le champ de bataille 1 \(\+1 point\)/);
    // La carte du champ de bataille ne compte pas comme une unité : l'adversaire ne tient rien.
    jouer(etat, etat.premier, { type: "debutTour" });
    expect(etat.joueurs[etat.premier].points).toBe(0);
  });

  it("jouer : incline et recycle les runes choisies, pose la carte inclinée, refuse un paiement truqué", () => {
    const etat = partie();
    jouer(etat, 0, { type: "canaliser", n: 3 });
    const [r1, r2, r3] = cartesDe(etat, idZone(0, "reserve")) as [string, string, string];
    const carte = cartesDe(etat, idZone(0, "main"))[0] as string;
    const autre = cartesDe(etat, idZone(1, "reserve"))[0] ?? cartesDe(etat, idZone(1, "legende"))[0] as string;
    expect(jouer(etat, 0, { type: "jouer", carte, vers: "0.base", inclinee: true, payer: { incliner: [r1, r1], recycler: [] } })).toEqual({ ok: false, erreur: "paiement_invalide" });
    expect(jouer(etat, 0, { type: "jouer", carte, vers: "0.base", inclinee: true, payer: { incliner: [autre], recycler: [] } })).toEqual({ ok: false, erreur: "paiement_invalide" });
    expect(jouer(etat, 0, { type: "jouer", carte, vers: "1.base", payer: { incliner: [], recycler: [] } })).toEqual({ ok: false, erreur: "zone_interdite" });
    expect(jouer(etat, 0, { type: "jouer", carte, vers: "0.base", inclinee: true, payer: { incliner: [r1, r2], recycler: [r2] } })).toEqual({ ok: true });
    expect(cartesDe(etat, idZone(0, "base"))).toEqual([carte]);
    expect(etat.cartes[carte]).toMatchObject({ inclinee: true, face: true });
    expect(etat.cartes[r1]?.inclinee).toBe(true);
    expect(cartesDe(etat, idZone(0, "reserve"))).toEqual([r1, r3]);
    expect(cartesDe(etat, idZone(0, "runes")).at(-1)).toBe(r2);
    expect(etat.journal.at(-1)?.texte).toBe("Alice joue {0} vers sa base (paie 2 énergie + 1 puissance).");
    // Une rune déjà inclinée ne paie plus d'énergie ; un sort part à la défausse.
    const sort = cartesDe(etat, idZone(0, "main"))[0] as string;
    expect(jouer(etat, 0, { type: "jouer", carte: sort, vers: "0.defausse", payer: { incliner: [r1], recycler: [] } })).toEqual({ ok: false, erreur: "paiement_invalide" });
    expect(jouer(etat, 0, { type: "jouer", carte: sort, vers: "0.defausse", inclinee: true, payer: { incliner: [r3], recycler: [] } })).toEqual({ ok: true });
    expect(etat.cartes[sort]?.inclinee).toBe(false);
    expect(etat.journal.at(-1)?.texte).toBe("Alice lance {0} (paie 1 énergie).");
  });

  it("bouger : s'incline, conquiert un champ vide (+1), combat sur un champ adverse, refuse une unité inclinée", () => {
    const etat = partie();
    const [a, b] = cartesDe(etat, idZone(0, "main")) as [string, string];
    const [x] = cartesDe(etat, idZone(1, "main")) as [string];
    jouer(etat, 0, { type: "deplacer", carte: a, vers: "0.base" });
    jouer(etat, 0, { type: "deplacer", carte: b, vers: "0.base" });
    jouer(etat, 1, { type: "deplacer", carte: x, vers: "1.base" });
    expect(jouer(etat, 0, { type: "bouger", carte: a, vers: "champ.0" })).toEqual({ ok: true });
    expect(etat.cartes[a]?.inclinee).toBe(true);
    expect(etat.joueurs[0].points).toBe(1);
    expect(etat.journal.at(-1)?.texte).toBe("Alice conquiert le champ de bataille 1 avec {0} (+1 point).");
    expect(jouer(etat, 0, { type: "bouger", carte: a, vers: "0.base" })).toEqual({ ok: false, erreur: "unite_inclinee" });
    expect(jouer(etat, 1, { type: "bouger", carte: a, vers: "champ.1" })).toEqual({ ok: false, erreur: "carte_interdite" });
    expect(jouer(etat, 1, { type: "bouger", carte: x, vers: "champ.0" })).toEqual({ ok: true });
    expect(etat.joueurs[1].points).toBe(0);
    expect(etat.journal.at(-1)?.texte).toBe("Bob envoie {0} au champ de bataille 1 : combat !");
    // Le 8e point ne vient pas d'une conquête : on pioche à la place.
    etat.joueurs[0].points = 7;
    const main = cartesDe(etat, idZone(0, "main")).length;
    jouer(etat, 0, { type: "bouger", carte: b, vers: "champ.1" });
    expect(etat.joueurs[0].points).toBe(7);
    expect(cartesDe(etat, idZone(0, "main"))).toHaveLength(main + 1);
  });
});

describe("API /api/parties (salon)", () => {
  type Env = ReturnType<typeof creerEnvironnementDeTest>;
  interface Appel {
    nom: string;
    url: string;
    corps: unknown;
  }

  beforeEach(() => {
    viderCacheMemoire();
    amorcerCataloguePourTest(catalogueDecks());
  });

  /** Fausse salle (Durable Object) : enregistre les appels du Worker. */
  function brancherSalles(env: Env): Appel[] {
    const appels: Appel[] = [];
    (env.env as unknown as { SALLES: unknown }).SALLES = {
      idFromName: (nom: string) => nom,
      get: (nom: string) => ({
        fetch: async (url: string, init?: RequestInit) => {
          appels.push({ nom, url, corps: init?.body ? JSON.parse(String(init.body)) : null });
          return Response.json({ ok: true });
        },
      }),
    };
    return appels;
  }

  async function joueurAvecDeck(env: Env, pseudo: string, valide = true): Promise<{ cookie: string; deck: number }> {
    const cookie = await env.inscrire(pseudo, "motdepasse");
    const { id } = env.bd.prepare("SELECT id FROM comptes WHERE pseudo = ?").get(pseudo) as { id: number };
    for (const c of CARTES) env.bd.prepare("INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, ?, 0, 12)").run(id, c.code);
    const deck = (await env.appeler("POST", "/api/decks", { cookie, corps: { nom: "Ekko" } })).json.id as number;
    const contenu = valide ? deckValide() : { ...deckValide(), runes: [] };
    await env.appeler("POST", `/api/decks/${deck}`, { cookie, corps: { nom: "Ekko", contenu } });
    return { cookie, deck };
  }

  it("crée une partie, l'ami la rejoint, la salle démarre avec les deux decks", async () => {
    const env = creerEnvironnementDeTest();
    const appels = brancherSalles(env);
    const alice = await joueurAvecDeck(env, "Alice");
    const bob = await joueurAvecDeck(env, "Bob");

    const creation = await env.appeler("POST", "/api/parties", { cookie: alice.cookie, corps: { deck: alice.deck } });
    expect(creation.statut).toBe(201);
    const code = creation.json.code as string;
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);

    const vueBob = await env.appeler("GET", `/api/parties/${code}`, { cookie: bob.cookie });
    expect(vueBob.json).toMatchObject({ statut: "attente", createur: "Alice", invite: null, moi: null });

    expect((await env.appeler("POST", `/api/parties/${code}/rejoindre`, { cookie: alice.cookie, corps: { deck: alice.deck } })).json.erreur).toBe(
      "partie_avec_soi",
    );
    const rejoindre = await env.appeler("POST", `/api/parties/${code}/rejoindre`, { cookie: bob.cookie, corps: { deck: bob.deck } });
    expect(rejoindre.statut).toBe(200);

    expect(appels).toHaveLength(1);
    const init = appels[0] as Appel & { corps: { code: string; joueurs: Array<{ pseudo: string; deck: DeckDeTable }> } };
    expect(init.nom).toBe(code);
    expect(init.url).toBe("https://salle/initialiser");
    expect(init.corps.joueurs.map((j) => j.pseudo)).toEqual(["Alice", "Bob"]);
    expect(init.corps.joueurs[1]?.deck.principal).toHaveLength(39);
    expect(init.corps.joueurs[1]?.deck.runes).toHaveLength(12);
    // La salle reçoit la liste des tokens du jeu (ici le token de test « tok »).
    expect((init.corps as unknown as { tokens: string[] }).tokens).toEqual(["tok"]);

    const liste = await env.appeler("GET", "/api/parties", { cookie: alice.cookie });
    expect(liste.json.parties).toEqual([expect.objectContaining({ code, statut: "en_cours", createur: "Alice", invite: "Bob", moi: 0 })]);

    const carol = await joueurAvecDeck(env, "Carol");
    const troisieme = await env.appeler("POST", `/api/parties/${code}/rejoindre`, { cookie: carol.cookie, corps: { deck: carol.deck } });
    expect(troisieme.json.erreur).toBe("partie_deja_commencee");
  });

  it("accepte un deck de démo prêté, sans posséder ses cartes", async () => {
    const env = creerEnvironnementDeTest();
    const appels = brancherSalles(env);
    // Deck de démo de test (les vrais utilisent des cartes absentes du catalogue de test).
    const demos = DECKS_DEMO as DeckDemo[];
    demos.push({ id: -9, nom: "Démo de test", contenu: deckValide() });
    try {
      const alice = await env.inscrire("Alice", "motdepasse"); // collection vide
      const bob = await env.inscrire("Bob", "motdepasse");
      const code = (await env.appeler("POST", "/api/parties", { cookie: alice, corps: { deck: -9 } })).json.code as string;
      expect(code).toMatch(/^[A-Z0-9]{8}$/);
      expect((await env.appeler("POST", `/api/parties/${code}/rejoindre`, { cookie: bob, corps: { deck: -9 } })).statut).toBe(200);
      expect((appels[0]?.corps as { joueurs: Array<{ deck: DeckDeTable }> }).joueurs[0]?.deck.principal).toHaveLength(39);
      expect((await env.appeler("POST", "/api/parties", { cookie: alice, corps: { deck: -42 } })).json.erreur).toBe("deck_introuvable");
      expect((await env.appeler("POST", "/api/parties", { cookie: alice, corps: { deck: 0 } })).statut).toBe(400);
    } finally {
      demos.pop();
    }
  });

  it("exige un deck valide qui m'appartient", async () => {
    const env = creerEnvironnementDeTest();
    brancherSalles(env);
    const alice = await joueurAvecDeck(env, "Alice", false);
    const bob = await joueurAvecDeck(env, "Bob");
    expect((await env.appeler("POST", "/api/parties", { cookie: alice.cookie, corps: { deck: alice.deck } })).json.erreur).toBe("deck_incomplet");
    expect((await env.appeler("POST", "/api/parties", { cookie: alice.cookie, corps: { deck: bob.deck } })).json.erreur).toBe("deck_introuvable");
  });

  it("quitter termine la partie et efface la salle", async () => {
    const env = creerEnvironnementDeTest();
    const appels = brancherSalles(env);
    const alice = await joueurAvecDeck(env, "Alice");
    const bob = await joueurAvecDeck(env, "Bob");
    const code = (await env.appeler("POST", "/api/parties", { cookie: alice.cookie, corps: { deck: alice.deck } })).json.code as string;
    await env.appeler("POST", `/api/parties/${code}/rejoindre`, { cookie: bob.cookie, corps: { deck: bob.deck } });
    expect((await env.appeler("DELETE", `/api/parties/${code}`, { cookie: bob.cookie })).statut).toBe(200);
    expect(appels.at(-1)?.url).toBe("https://salle/fin");
    expect((await env.appeler("GET", "/api/parties", { cookie: alice.cookie })).json.parties).toEqual([]);
    expect((await env.appeler("DELETE", `/api/parties/${code}`, { cookie: alice.cookie })).statut).toBe(404);
  });

  it(`plafonne à ${MAX_PARTIES_OUVERTES} parties ouvertes par joueur`, async () => {
    const env = creerEnvironnementDeTest();
    brancherSalles(env);
    const alice = await joueurAvecDeck(env, "Alice");
    for (let i = 0; i < MAX_PARTIES_OUVERTES; i++) {
      expect((await env.appeler("POST", "/api/parties", { cookie: alice.cookie, corps: { deck: alice.deck } })).statut).toBe(201);
    }
    expect((await env.appeler("POST", "/api/parties", { cookie: alice.cookie, corps: { deck: alice.deck } })).json.erreur).toBe("trop_de_parties");
  });

  it("protège la connexion WebSocket : WebSocket, même origine, participant, partie commencée", async () => {
    const env = creerEnvironnementDeTest();
    brancherSalles(env);
    const alice = await joueurAvecDeck(env, "Alice");
    const bob = await joueurAvecDeck(env, "Bob");
    const code = (await env.appeler("POST", "/api/parties", { cookie: alice.cookie, corps: { deck: alice.deck } })).json.code as string;
    const ws = (cookie: string, entetes: Record<string, string> = { Upgrade: "websocket" }) =>
      env.appeler("GET", `/api/parties/${code}/ws`, { cookie, entetes });
    expect((await ws(alice.cookie, {})).statut).toBe(426);
    expect((await ws(alice.cookie, { Upgrade: "websocket", Origin: "https://pirate.example" })).statut).toBe(403);
    expect((await ws(bob.cookie)).statut).toBe(404);
    expect((await ws(alice.cookie)).json.erreur).toBe("partie_non_commencee");
    expect((await env.appeler("GET", `/api/parties/${code}/ws`, { entetes: { Upgrade: "websocket" } })).statut).toBe(401);
  });
});
