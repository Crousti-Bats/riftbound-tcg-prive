/** Mini-catalogue de test pour les decks et la table de jeu (Légendes, champions, signatures, runes, terrains). */
import type { CarteCatalogue, Catalogue } from "../../catalogue/types-catalogue";
import { type ContenuDeck, nomsDesChampions } from "../../decks/regles-deck";

function carte(code: string, partiel: Partial<CarteCatalogue>): CarteCatalogue {
  return {
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
    image: "https://cmsassets.rgpub.io/x-744x1039.png",
    orientation: "portrait",
    energie: 1,
    puissance: null,
    force: 1,
    texte: null,
    artiste: null,
    ...partiel,
  };
}

export const CARTES: CarteCatalogue[] = [
  carte("leg-ekko", { nom: "Boy Who Shattered Time", type: "Legend", tags: ["Ekko"], domaines: ["Fury", "Mind"] }),
  carte("leg-ziggs", { nom: "Hexplosives Expert", type: "Legend", tags: ["Yordle", "Ziggs"], domaines: ["Fury", "Chaos"] }),
  carte("ch-ekko", { nom: "Ekko", sousTitre: "Recurrent", etiquettes: ["Champion"], tags: ["Ekko"] }),
  carte("ch-ekko-alt", { nom: "Ekko", sousTitre: "Recurrent", etiquettes: ["Champion"], tags: ["Ekko"], variante: "alt" }),
  carte("ch-jinx", { nom: "Jinx", sousTitre: "Demolitionist", etiquettes: ["Champion"], tags: ["Jinx"] }),
  carte("ch-ziggs", { nom: "Ziggs", sousTitre: "Bombardier", etiquettes: ["Champion"], tags: ["Ziggs", "Yordle"] }),
  carte("sig-ekko", { nom: "Chronobreak", type: "Spell", etiquettes: ["Signature"], tags: ["Ekko"], domaines: ["Fury", "Mind"] }),
  carte("sig-jinx", { nom: "Super Mega Death Rocket", type: "Spell", etiquettes: ["Signature"], tags: ["Jinx"] }),
  ...Array.from({ length: 14 }, (_, i) => carte(`un-${i}`, { nom: `Unite ${i}` })),
  carte("un-0-alt", { nom: "Unite 0", variante: "alt" }),
  carte("calme", { nom: "Moine calme", domaines: ["Calm"] }),
  carte("neutre", { nom: "Relique", type: "Gear", domaines: [] }),
  carte("rune-fury", { nom: "Fury Rune", type: "Rune", variante: "rune", etiquettes: ["Basic"] }),
  carte("rune-mind", { nom: "Mind Rune", type: "Rune", variante: "rune", domaines: ["Mind"], etiquettes: ["Basic"] }),
  carte("rune-calm", { nom: "Calm Rune", type: "Rune", variante: "rune", domaines: ["Calm"], etiquettes: ["Basic"] }),
  carte("bf0", { nom: "Black Market", type: "Battlefield", domaines: ["Colorless"], orientation: "paysage" }),
  carte("bf0-bis", { nom: "Black Market", type: "Battlefield", domaines: ["Colorless"], orientation: "paysage" }),
  carte("bf1", { nom: "Black Rose Sanctum", type: "Battlefield", domaines: ["Colorless"], orientation: "paysage" }),
  carte("bf2", { nom: "Bandle Scouts' Academy", type: "Battlefield", domaines: ["Colorless"], orientation: "paysage" }),
  carte("tok", { nom: "Bomb", type: "Gear", variante: "token", etiquettes: ["Token"] }),
];
export const PAR_CODE = new Map(CARTES.map((c) => [c.code, c]));
export const CHAMPIONS = nomsDesChampions(CARTES);

/** Deck valide : Légende Ekko, champion Ekko, 13 × 3 unités + champion = 40, 12 runes, 3 champs de bataille. */
export function deckValide(): ContenuDeck {
  return {
    legende: "leg-ekko",
    champion: "ch-ekko",
    principal: Array.from({ length: 13 }, (_, i) => ({ code: `un-${i}`, n: 3 })),
    runes: [
      { code: "rune-fury", n: 6 },
      { code: "rune-mind", n: 6 },
    ],
    terrains: ["bf0", "bf1", "bf2"],
  };
}

/** Possession de tout ce que demande le deck (et un peu plus). */
export function toutPosseder(): Map<string, number> {
  return new Map(CARTES.map((c) => [c.code, 12]));
}

export function catalogueDecks(): Catalogue {
  return {
    cartes: CARTES,
    sets: [{ code: "tst", nom: "Test", ouvrable: false, nbCartes: CARTES.length, parVariante: {}, parRarete: {} }],
    miseAJourSource: null,
    chargeLe: Date.now() + Math.random(),
    cartesIgnorees: 0,
  };
}
