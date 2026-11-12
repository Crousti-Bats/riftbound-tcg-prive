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

/** Catégories de recyclage, de la moins à la plus précieuse (on peut recycler seulement certaines d'entre elles). */
export const CATEGORIES_ECLATS = ["commune", "peu-commune", "rare", "epique", "alt", "overnumbered", "signee", "special"] as const;
export type CategorieEclats = (typeof CATEGORIES_ECLATS)[number];

/** Éclats rapportés par un exemplaire normal de chaque catégorie (Special et Ultime ensemble). */
export const VALEUR_CATEGORIE: Record<CategorieEclats, number> = {
  commune: 1,
  "peu-commune": 3,
  rare: 5,
  epique: 40,
  alt: 80,
  overnumbered: 200,
  signee: 500,
  special: 1000,
};

const CATEGORIE_VARIANTE: Partial<Record<string, CategorieEclats>> = {
  ultime: "special",
  special: "special",
  signee: "signee",
  overnumbered: "overnumbered",
  alt: "alt",
};
const CATEGORIE_RARETE: Partial<Record<string, CategorieEclats>> = {
  Epic: "epique",
  Showcase: "epique",
  Rare: "rare",
  Uncommon: "peu-commune",
  Common: "commune",
};

type CarteEclats = Pick<CarteCatalogue, "rarete" | "variante" | "type">;

/** Runes et tokens : ni recyclables, ni fabricables. */
function estRuneOuToken(carte: CarteEclats): boolean {
  const type = carte.type.toLowerCase();
  return ["rune", "rune_alt", "token"].includes(carte.variante) || type === "rune" || type === "token";
}

/** Catégorie de recyclage d'une carte (la variante prime sur la rareté), ou null si elle n'est pas recyclable. */
export function categorieEclats(carte: CarteEclats): CategorieEclats | null {
  if (estRuneOuToken(carte)) return null;
  return CATEGORIE_VARIANTE[carte.variante] ?? CATEGORIE_RARETE[carte.rarete] ?? null;
}

/** Éclats rapportés par le recyclage d'un exemplaire (0 : non recyclable). */
export function valeurRecyclage(carte: CarteEclats, foil: boolean): number {
  const categorie = categorieEclats(carte);
  const base = categorie ? VALEUR_CATEGORIE[categorie] : 0;
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
