/**
 * Éclats : la monnaie des doublons (demandé le 2026-11-12). Fonctions pures, sans base ni réseau.
 * - On recycle une carte en trop contre des éclats ; on garde toujours 1 exemplaire, ou plus si un de mes decks
 *   en utilise davantage.
 * - Les éclats achètent un booster (ajouté aux boosters offerts) ou fabriquent une carte précise (version normale).
 * Tous les prix sont ici, nulle part ailleurs.
 */
import type { CarteCatalogue } from "../catalogue/types-catalogue";

/** Prix d'un booster (ouvrable dans le set de son choix). Un booster recyclé rapporte environ 40 éclats. */
export const PRIX_BOOSTER = 100;
/** Une foil rapporte deux fois plus qu'une carte normale. */
export const MULTIPLICATEUR_FOIL = 2;
/** Fabriquer une carte coûte 4 fois ce que rapporte son recyclage. */
export const MULTIPLICATEUR_FABRICATION = 4;

const VALEUR_VARIANTE: Partial<Record<string, number>> = { ultime: 1000, special: 1000, signee: 500, overnumbered: 200, alt: 80 };
const VALEUR_RARETE: Partial<Record<string, number>> = { Epic: 40, Showcase: 40, Rare: 10, Uncommon: 3, Common: 1 };

type CarteEclats = Pick<CarteCatalogue, "rarete" | "variante" | "type">;

/** Runes et tokens : ni recyclables, ni fabricables. */
function estRuneOuToken(carte: CarteEclats): boolean {
  const type = carte.type.toLowerCase();
  return ["rune", "rune_alt", "token"].includes(carte.variante) || type === "rune" || type === "token";
}

/** Éclats rapportés par le recyclage d'un exemplaire (0 : non recyclable). La variante prime sur la rareté. */
export function valeurRecyclage(carte: CarteEclats, foil: boolean): number {
  if (estRuneOuToken(carte)) return 0;
  const base = VALEUR_VARIANTE[carte.variante] ?? VALEUR_RARETE[carte.rarete] ?? 0;
  return foil ? base * MULTIPLICATEUR_FOIL : base;
}

/** Coût de fabrication de la version normale, ou null si la carte n'est pas fabricable. */
export function coutFabrication(carte: CarteEclats): number | null {
  const valeur = valeurRecyclage(carte, false);
  return valeur > 0 ? valeur * MULTIPLICATEUR_FABRICATION : null;
}

export interface Possede {
  normale: number;
  foil: number;
}

/** Exemplaires à garder : 1, ou le plus grand nombre utilisé par un de mes decks. */
export function exemplairesProteges(usageMax: number | undefined): number {
  return Math.max(1, usageMax ?? 0);
}

/** Usage maximal de chaque carte parmi plusieurs decks (un deck à la fois sur la table : on garde le max). */
export function usageMaximal(decks: Iterable<ReadonlyMap<string, number>>): Map<string, number> {
  const max = new Map<string, number>();
  for (const deck of decks) for (const [code, n] of deck) max.set(code, Math.max(max.get(code) ?? 0, n));
  return max;
}

/**
 * Doublons recyclables d'une carte : tout ce qui dépasse les exemplaires protégés.
 * Les normales partent en premier, la foil est gardée le plus longtemps.
 */
export function doublonsDe(possede: Possede, proteges: number): Possede {
  const surplus = Math.max(0, possede.normale + possede.foil - proteges);
  const normale = Math.min(possede.normale, surplus);
  return { normale, foil: Math.min(possede.foil, surplus - normale) };
}
