/**
 * Taux de drop et composition des boosters — SOURCE DE VÉRITÉ (doc §4, validés par l'utilisateur le 2026-11-08).
 * Tout changement de taux se fait ici, nulle part ailleurs.
 */

/** Stock de boosters : 10 au maximum, +1 toutes les 20 minutes, 10 à l'inscription (décision du 2026-11-10 ;
 *  avant : 15 au maximum, +1 toutes les 10 minutes). */
export const STOCK_MAX = 10;
export const INTERVALLE_REGEN_MS = 20 * 60_000;
export const BOOSTERS_INITIAUX = 10;

/** Un booster contient 14 cartes réparties dans 5 types de slots. */
export const COMPOSITION = {
  common: 7,
  uncommon: 3,
  foil: 1,
  rarePlus: 2,
  runeToken: 1,
} as const;

export const TOTAL_CARTES_BOOSTER =
  COMPOSITION.common + COMPOSITION.uncommon + COMPOSITION.foil + COMPOSITION.rarePlus + COMPOSITION.runeToken;

/** Catégories qu'un slot Rare+ peut produire. */
export type CategorieRarePlus = "ultime" | "special" | "signee" | "overnumbered" | "alt" | "epic" | "rare";

/**
 * Probabilités par slot Rare+ (il y a 2 slots indépendants par booster : « 1 booster sur N » = 1/(2N) par slot).
 * 2026-11-09 : tous les taux Rare+ divisés par 2 (Epic 1/12, Alt 1/24, Over 1/144, Signée 1/480, Special et
 * Ultime 1/2000 boosters).
 * 2026-11-10 : de nouveau divisés par 2 à la demande de l'utilisateur. PAR BOOSTER : Epic 1/24, Alt Art 1/48,
 * Overnumbered 1/288, Signée 1/960, Special et Ultime 1/4000. La différence revient aux Rares.
 * Lues dans l'ordre, de façon cumulative. Tout le reste (~97 %) va à "rare".
 * Si le pool d'une catégorie est vide pour le set ouvert, le tirage retombe sur "rare"
 * (sa probabilité est ainsi automatiquement reversée aux Rares).
 */
export const TAUX_RARE_PLUS: ReadonlyArray<{ categorie: Exclude<CategorieRarePlus, "rare">; p: number }> = [
  { categorie: "ultime", p: 1 / 8000 }, //        1 booster / 4000 → 1/8000 par slot (Baron Nashor, Unleashed)
  { categorie: "special", p: 1 / 8000 }, //       1 booster / 4000 → 1/8000 par slot (Special Alt)
  { categorie: "signee", p: 1 / 1920 }, //        1 booster / 960 → 1/1920 par slot (Overnumbered signée)
  { categorie: "overnumbered", p: 1 / 576 }, //   1 booster / 288 → 1/576 par slot (Overnumbered)
  { categorie: "alt", p: 1 / 96 }, //             1 booster / 48 → 1/96 par slot (Alt Art)
  { categorie: "epic", p: (1 / 24 - 0.01) / 2 }, // Epic 1 booster / 24, après retrait de la part Foil (1 %)
  // reste ≈ 0,9714 → "rare"
];

/** Slot Foil : rareté de la carte brillante (estimation communautaire). Le reste (0,75) est Common. */
export const TAUX_FOIL: ReadonlyArray<{ rarete: "Common" | "Uncommon" | "Rare" | "Epic"; p: number }> = [
  { rarete: "Epic", p: 0.01 },
  { rarete: "Rare", p: 0.04 },
  { rarete: "Uncommon", p: 0.2 },
  // reste 0,75 → Common
];

/** Slot Rune/Token : 92 % rune normale, 8 % rune alt. */
export const PROBA_RUNE_ALT = 0.08;
