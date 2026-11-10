import { describe, expect, it } from "vitest";
import { type ContenuDeck, ajouterCarte, grouperParType, retirerCarte, zoneDeCarte } from "./decks";
import type { Carte } from "./libelles-cartes";

const carte = (code: string, partiel: Partial<Carte> = {}): Carte => ({
  code,
  nom: code,
  sousTitre: null,
  set: "tst",
  numero: "001-100",
  rarete: "Common",
  variante: "base",
  type: "Unit",
  etiquettes: [],
  tags: [],
  domaines: ["Fury"],
  image: "",
  orientation: "portrait",
  energie: 2,
  puissance: null,
  force: 1,
  texte: null,
  artiste: null,
  ...partiel,
});

const LEGENDE = carte("leg", { nom: "Boy Who Shattered Time", type: "Legend", tags: ["Ekko"] });
const EKKO = carte("ekko", { nom: "Ekko", sousTitre: "Recurrent", etiquettes: ["Champion"] });
const EKKO_ALT = carte("ekko-alt", { nom: "Ekko", sousTitre: "Recurrent", etiquettes: ["Champion"], variante: "alt" });
const JINX = carte("jinx", { nom: "Jinx", etiquettes: ["Champion"] });
const UNITE = carte("unite");
const SORT = carte("sort", { type: "Spell", energie: 1 });
const RUNE = carte("rune", { type: "Rune" });
const TERRAIN = carte("bf", { nom: "Black Market", type: "Battlefield" });
const TERRAIN_BIS = carte("bf-bis", { nom: "Black Market", type: "Battlefield" });
const TOKEN = carte("tok", { variante: "token" });
const CARTES = Object.fromEntries([LEGENDE, EKKO, EKKO_ALT, JINX, UNITE, SORT, RUNE, TERRAIN, TERRAIN_BIS, TOKEN].map((c) => [c.code, c]));
const VIDE: ContenuDeck = { legende: null, champion: null, principal: [], runes: [], terrains: [] };

function ajouter(deck: ContenuDeck, c: Carte, possedees = 12): ContenuDeck {
  const r = ajouterCarte(deck, c, possedees, CARTES);
  if (!r.ok) throw new Error(r.raison);
  return r.deck;
}

describe("Éditeur de deck", () => {
  it("place chaque carte dans sa zone", () => {
    expect(zoneDeCarte(LEGENDE, VIDE, CARTES)).toBe("legende");
    expect(zoneDeCarte(TERRAIN, VIDE, CARTES)).toBe("terrains");
    expect(zoneDeCarte(RUNE, VIDE, CARTES)).toBe("runes");
    expect(zoneDeCarte(UNITE, VIDE, CARTES)).toBe("principal");
    expect(zoneDeCarte(TOKEN, VIDE, CARTES)).toBeNull();
  });

  it("le champion de la Légende devient le champion choisi, les autres vont dans le deck principal", () => {
    const avecLegende = ajouter(VIDE, LEGENDE);
    expect(zoneDeCarte(JINX, avecLegende, CARTES)).toBe("principal");
    const avecChampion = ajouter(avecLegende, EKKO);
    expect(avecChampion.champion).toBe("ekko");
    expect(ajouter(avecChampion, EKKO).principal).toEqual([{ code: "ekko", n: 1 }]);
  });

  it("limite à 3 exemplaires d'un même nom (champion et variantes compris)", () => {
    let deck = ajouter(ajouter(VIDE, LEGENDE), EKKO);
    deck = ajouter(ajouter(deck, EKKO_ALT), EKKO);
    const r = ajouterCarte(deck, EKKO_ALT, 12, CARTES);
    expect(r).toEqual({ ok: false, raison: "3 exemplaires au maximum de Ekko, Recurrent." });
  });

  it("respecte la possession, les 12 runes et les 3 champs de bataille différents", () => {
    expect(ajouterCarte(ajouter(VIDE, UNITE, 1), UNITE, 1, CARTES)).toEqual({ ok: false, raison: "Tu n'as que 1 × unite." });
    let deck = VIDE;
    for (let i = 0; i < 12; i++) deck = ajouter(deck, RUNE);
    expect(deck.runes).toEqual([{ code: "rune", n: 12 }]);
    expect(ajouterCarte(deck, RUNE, 20, CARTES).ok).toBe(false);
    deck = ajouter(deck, TERRAIN);
    expect(ajouterCarte(deck, TERRAIN_BIS, 1, CARTES)).toEqual({ ok: false, raison: "Ce champ de bataille est déjà dans le deck." });
  });

  it("retire un exemplaire à la fois", () => {
    const deck = ajouter(ajouter(VIDE, UNITE), UNITE);
    expect(retirerCarte(deck, "principal", "unite").principal).toEqual([{ code: "unite", n: 1 }]);
    expect(retirerCarte(retirerCarte(deck, "principal", "unite"), "principal", "unite").principal).toEqual([]);
  });

  it("groupe le deck principal par type, puis par coût", () => {
    const groupes = grouperParType([{ code: "unite", n: 3 }, { code: "sort", n: 2 }, { code: "jinx", n: 1 }], CARTES);
    expect(groupes.map((g) => [g.type, g.total])).toEqual([["Unit", 4], ["Spell", 2]]);
  });
});
