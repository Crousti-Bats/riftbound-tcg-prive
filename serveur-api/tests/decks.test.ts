/** Tests des decks : règles de construction (Core Rules 103.x), possession, export texte, API /api/decks. */
import { beforeEach, describe, expect, it } from "vitest";
import { amorcerCataloguePourTest, viderCacheMemoire } from "../catalogue/source-cartes";
import { MAX_DECKS } from "../decks/routes-decks";
import { type ContenuDeck, exporterTexte, validerDeck } from "../decks/regles-deck";
import { CARTES, CHAMPIONS, PAR_CODE, catalogueDecks, deckValide, toutPosseder } from "./outils/catalogue-decks-de-test";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

const valider = (deck: ContenuDeck, possession = toutPosseder()) => validerDeck(deck, PAR_CODE, CHAMPIONS, possession);

describe("Règles de construction d'un deck", () => {
  it("accepte un deck complet et conforme", () => {
    const v = valider(deckValide());
    expect(v.erreurs).toEqual([]);
    expect(v.valide).toBe(true);
    expect(v.compteurs).toEqual({ principal: 40, runes: 12, terrains: 3 });
  });

  it("signale un deck vide, élément par élément", () => {
    const v = valider({ legende: null, champion: null, principal: [], runes: [], terrains: [] });
    expect(v.valide).toBe(false);
    expect(v.erreurs).toEqual([
      "Choisis une Légende.",
      "Choisis ton champion (une unité Champion de ta Légende).",
      "Deck principal : 0/40 cartes (champion compris).",
      "Runes : 0/12.",
      "Champs de bataille : 0/3.",
    ]);
  });

  it("exige le champion de la Légende (le tag de région « Yordle » ne compte pas)", () => {
    expect(valider({ ...deckValide(), champion: "ch-jinx" }).erreurs).toContain("Le champion doit être Ekko (pas Jinx).");
    const ziggs = { ...deckValide(), legende: "leg-ziggs", champion: "ch-ziggs", runes: [{ code: "rune-fury", n: 12 }] };
    expect(valider(ziggs).erreurs).toEqual([]);
  });

  it("limite à 3 exemplaires d'un même nom, variantes et champion compris", () => {
    const deck = deckValide();
    deck.principal.push({ code: "un-0-alt", n: 1 });
    expect(valider(deck).erreurs).toContain("4 × Unite 0 : 3 exemplaires au maximum (champion compris).");
    const champion = { ...deckValide(), principal: [...deckValide().principal.slice(1), { code: "ch-ekko-alt", n: 3 }] };
    expect(valider(champion).erreurs).toContain("4 × Ekko, Recurrent : 3 exemplaires au maximum (champion compris).");
  });

  it("vérifie les domaines de la Légende (cartes sans domaine et champs de bataille acceptés)", () => {
    const deck = deckValide();
    deck.principal[0] = { code: "calme", n: 1 };
    deck.principal.push({ code: "neutre", n: 2 });
    deck.runes = [{ code: "rune-fury", n: 11 }, { code: "rune-calm", n: 1 }];
    const erreurs = valider(deck).erreurs;
    expect(erreurs).toContain("Moine calme n'est pas dans les domaines de ta Légende.");
    expect(erreurs).toContain("Calm Rune n'est pas dans les domaines de ta Légende.");
    expect(erreurs.some((e) => e.includes("Relique") || e.includes("Black Market"))).toBe(false);
  });

  it("limite les cartes Signature à 3, et seulement celles du champion de la Légende", () => {
    const deck = deckValide();
    deck.principal[0] = { code: "sig-ekko", n: 3 };
    expect(valider(deck).erreurs).toEqual([]);
    deck.principal[1] = { code: "sig-jinx", n: 1 };
    const erreurs = valider(deck).erreurs;
    expect(erreurs).toContain("4 cartes Signature : 3 au maximum.");
    expect(erreurs).toContain("Super Mega Death Rocket est une carte Signature d'un autre champion.");
  });

  it("exige 12 runes et 3 champs de bataille de noms différents", () => {
    const deck = { ...deckValide(), runes: [{ code: "rune-fury", n: 11 }], terrains: ["bf0", "bf0-bis", "bf1"] };
    const erreurs = valider(deck).erreurs;
    expect(erreurs).toContain("Runes : 11/12.");
    expect(erreurs).toContain("Black Market est en double : 3 champs de bataille différents.");
  });

  it("refuse les tokens, Légendes, runes et champs de bataille dans le deck principal", () => {
    const deck = deckValide();
    deck.principal.push({ code: "tok", n: 1 }, { code: "rune-fury", n: 1 }, { code: "leg-ziggs", n: 1 });
    const erreurs = valider(deck).erreurs;
    expect(erreurs).toContain("Bomb ne va pas dans le deck principal.");
    expect(erreurs).toContain("Fury Rune ne va pas dans le deck principal.");
    expect(erreurs).toContain("Hexplosives Expert ne va pas dans le deck principal.");
  });

  it("n'autorise que les cartes possédées, en quantité suffisante", () => {
    const possession = toutPosseder();
    possession.set("un-5", 2);
    possession.delete("bf2");
    const erreurs = valider(deckValide(), possession).erreurs;
    expect(erreurs).toContain("Tu as 2 × Unite 5, il en faut 3.");
    expect(erreurs).toContain("Tu as 0 × Bandle Scouts' Academy, il en faut 1.");
  });
});

describe("Export texte (TCG Arena, Rift Atlas, riftbound.gg…)", () => {
  it("écrit les sections, « N Nom » sans « x », la Légende sous la forme « Champion, Titre »", () => {
    const deck = deckValide();
    deck.principal = [{ code: "un-0", n: 2 }, { code: "un-0-alt", n: 1 }, { code: "sig-ekko", n: 2 }];
    expect(exporterTexte(deck, PAR_CODE, CHAMPIONS)).toBe(
      [
        "Legend:",
        "1 Ekko, Boy Who Shattered Time",
        "",
        "Champion:",
        "1 Ekko, Recurrent",
        "",
        "MainDeck:",
        "3 Unite 0",
        "2 Chronobreak",
        "",
        "Battlefields:",
        "1 Black Market",
        "1 Black Rose Sanctum",
        "1 Bandle Scouts' Academy",
        "",
        "Runes:",
        "6 Fury Rune",
        "6 Mind Rune",
      ].join("\n"),
    );
  });

  it("omet les sections vides", () => {
    expect(exporterTexte({ legende: null, champion: null, principal: [], runes: [{ code: "rune-fury", n: 2 }], terrains: [] }, PAR_CODE, CHAMPIONS)).toBe(
      "Runes:\n2 Fury Rune",
    );
  });
});

describe("API /api/decks", () => {
  type Env = ReturnType<typeof creerEnvironnementDeTest>;
  interface Analyse {
    id: number;
    nom: string;
    contenu: ContenuDeck;
    cartes: Record<string, { nom: string }>;
    possession: Record<string, number>;
    validation: { valide: boolean; erreurs: string[] };
    export: string;
  }

  beforeEach(() => {
    viderCacheMemoire();
    amorcerCataloguePourTest(catalogueDecks());
  });

  function donnerTout(env: Env, pseudo: string): void {
    const { id } = env.bd.prepare("SELECT id FROM comptes WHERE pseudo = ?").get(pseudo) as { id: number };
    for (const c of CARTES) {
      env.bd.prepare("INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, ?, 0, 12)").run(id, c.code);
    }
  }
  async function creer(env: Env, cookie: string, nom = "Mon deck"): Promise<number> {
    const r = await env.appeler("POST", "/api/decks", { cookie, corps: { nom } });
    expect(r.statut).toBe(201);
    return r.json.id as number;
  }

  it("crée, enregistre, valide, liste et supprime un deck", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    donnerTout(env, "Alice");
    const id = await creer(env, cookie);

    const vide = (await env.appeler("GET", `/api/decks/${id}`, { cookie })).json as unknown as Analyse;
    expect(vide.nom).toBe("Mon deck");
    expect(vide.validation.valide).toBe(false);

    const r = await env.appeler("POST", `/api/decks/${id}`, { cookie, corps: { nom: "Ekko tempo", contenu: deckValide() } });
    expect(r.statut).toBe(200);
    const enregistre = r.json as unknown as Analyse;
    expect(enregistre.validation).toEqual({ valide: true, erreurs: [], compteurs: { principal: 40, runes: 12, terrains: 3 } });
    expect(enregistre.export.startsWith("Legend:\n1 Ekko, Boy Who Shattered Time")).toBe(true);
    expect(enregistre.cartes["ch-ekko"]?.nom).toBe("Ekko");
    expect(enregistre.possession["un-0"]).toBe(12);

    const relu = (await env.appeler("GET", `/api/decks/${id}`, { cookie })).json as unknown as Analyse;
    expect(relu.contenu).toEqual(deckValide());

    const liste = (await env.appeler("GET", "/api/decks", { cookie })).json as {
      decks: Array<{ id: number; nom: string; valide: boolean; legende: { code: string } | null }>;
    };
    expect(liste.decks).toHaveLength(1);
    expect(liste.decks[0]).toMatchObject({ id, nom: "Ekko tempo", valide: true, legende: { code: "leg-ekko" } });

    expect((await env.appeler("DELETE", `/api/decks/${id}`, { cookie })).statut).toBe(200);
    expect((await env.appeler("GET", `/api/decks/${id}`, { cookie })).statut).toBe(404);
  });

  it("enregistre un deck avec des cartes manquantes, mais le signale non valide", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = await creer(env, cookie);
    const r = await env.appeler("POST", `/api/decks/${id}`, { cookie, corps: { nom: "Rêve", contenu: deckValide() } });
    expect(r.statut).toBe(200);
    const analyse = r.json as unknown as Analyse;
    expect(analyse.validation.valide).toBe(false);
    expect(analyse.validation.erreurs).toContain("Tu as 0 × Unite 0, il en faut 3.");
  });

  it("refuse une carte inconnue ou un contenu mal formé", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = await creer(env, cookie);
    const inconnue = await env.appeler("POST", `/api/decks/${id}`, { cookie, corps: { nom: "X", contenu: { ...deckValide(), legende: "zzz-999" } } });
    expect(inconnue.statut).toBe(400);
    expect(inconnue.json.erreur).toBe("carte_introuvable");
    const quatre = { ...deckValide(), principal: [{ code: "un-0", n: 4 }] };
    expect((await env.appeler("POST", `/api/decks/${id}`, { cookie, corps: { nom: "X", contenu: quatre } })).statut).toBe(400);
    expect((await env.appeler("POST", `/api/decks/${id}`, { cookie, corps: { nom: "", contenu: deckValide() } })).statut).toBe(400);
  });

  it("garde les decks privés : un autre joueur ne peut ni les lire, ni les modifier, ni les supprimer", async () => {
    const env = creerEnvironnementDeTest();
    const alice = await env.inscrire("Alice", "motdepasse");
    const bob = await env.inscrire("Bob", "motdepasse");
    const id = await creer(env, alice);
    expect((await env.appeler("GET", `/api/decks/${id}`, { cookie: bob })).statut).toBe(404);
    expect((await env.appeler("POST", `/api/decks/${id}`, { cookie: bob, corps: { nom: "Volé", contenu: deckValide() } })).statut).toBe(404);
    expect((await env.appeler("DELETE", `/api/decks/${id}`, { cookie: bob })).statut).toBe(404);
    expect(((await env.appeler("GET", "/api/decks", { cookie: bob })).json.decks as unknown[]).length).toBe(0);
    expect((await env.appeler("GET", "/api/decks", {})).statut).toBe(401);
  });

  it(`plafonne à ${MAX_DECKS} decks par joueur`, async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    for (let i = 0; i < MAX_DECKS; i++) await creer(env, cookie, `Deck ${i}`);
    const r = await env.appeler("POST", "/api/decks", { cookie, corps: { nom: "Un de trop" } });
    expect(r.statut).toBe(409);
    expect(r.json.erreur).toBe("trop_de_decks");
  });

  it("filtre la collection par domaines de Légende (cartes sans domaine et champs de bataille gardés)", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    donnerTout(env, "Alice");
    const r = await env.appeler("GET", "/api/collection?domaines=Fury,Mind&recherche=e", { cookie });
    const codes = (r.json.cartes as Array<{ code: string }>).map((c) => c.code);
    expect(codes).toContain("neutre");
    expect(codes).toContain("bf2");
    expect(codes).toContain("rune-mind");
    expect(codes).not.toContain("calme");
    expect(codes).not.toContain("rune-calm");
  });
});
