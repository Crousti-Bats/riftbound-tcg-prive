/**
 * Taux de drop et composition des boosters — SOURCE DE VÉRITÉ (doc §4, validés par l'utilisateur le 2026-11-08).
 * Tout changement de taux se fait ici, nulle part ailleurs.
 */

/** Stock de boosters : 15 au maximum, +1 toutes les 10 minutes, 15 à l'inscription. */
export const STOCK_MAX = 15;
export const INTERVALLE_REGEN_MS = 10 * 60_000;
export const BOOSTERS_INITIAUX = 15;

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
 * Probabilités par slot Rare+ (il y a 2 slots indépendants par booster).
 * 2026-11-09 : tous les taux Rare+ divisés par 2 à la demande de l'utilisateur (Epic 1/12, Alt 1/24,
 * Over 1/144, Signée 1/480, Special et Ultime 1/2000 boosters). La différence revient aux Rares.
 * Lues dans l'ordre, de façon cumulative. Tout le reste (~87 %) va à "rare".
 * Si le pool d'une catégorie est vide pour le set ouvert, le tirage retombe sur "rare"
 * (sa probabilité est ainsi automatiquement reversée aux Rares).
 */
export const TAUX_RARE_PLUS: ReadonlyArray<{ categorie: Exclude<CategorieRarePlus, "rare">; p: number }> = [
  { categorie: "ultime", p: 0.00025 }, //       1 booster / 2000 → 1/4000 par slot (Baron Nashor, Unleashed)
  { categorie: "special", p: 0.00025 }, //      1 booster / 2000 → 1/4000 par slot (Special Alt)
  { categorie: "signee", p: 0.00104 }, //       1 booster / 480 → 1/960 par slot (Overnumbered signée)
  { categorie: "overnumbered", p: 0.00347 }, // 1 booster / 144 → 1/288 par slot (Overnumbered)
  { categorie: "alt", p: 0.0208 }, //           1 booster / 24 → 1/48 par slot (Alt Art)
  { categorie: "epic", p: 0.03667 }, //         (1/12 − 0,01) / 2 (Epic 1 booster / 12, après retrait de la part Foil)
  // reste ≈ 0,93767 → "rare"
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
