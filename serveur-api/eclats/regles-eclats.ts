/**
 * Éclats : la monnaie des doublons. Fonctions pures, sans base ni réseau.
 * - On recycle une carte en trop contre des éclats ; on garde toujours 1 exemplaire.
 * - Les éclats achètent un booster (ajouté aux boosters offerts) ou fabriquent une carte précise (version normale).
 * Tous les prix sont ici, nulle part ailleurs.
 */
import type { CarteCatalogue } from "../catalogue/types-catalogue";

/** Prix d'un booster (ouvrable dans le set de son choix), 200 depuis le 2026-11-12 (avant : 100). Un booster recyclé rapporte environ 30 éclats. */
export const PRIX_BOOSTER = 200;
/** Une foil rapporte deux fois plus qu'une carte normale. */
export const MULTIPLICATEUR_FOIL = 2;
/** Fabriquer une carte coûte 40 fois ce que rapporte son recyclage (×4 avant le 2026-11-12). */
export const MULTIPLICATEUR_FABRICATION = 40;

/** Catégories de recyclage, de la moins à la plus précieuse (on peut recycler seulement certaines d'entre elles). */
export const CATEGORIES_ECLATS = ["rune", "commune", "peu-commune", "rare", "epique", "rune-alt", "alt", "overnumbered", "signee", "special"] as const;
export type CategorieEclats = (typeof CATEGORIES_ECLATS)[number];

/** Éclats rapportés par un exemplaire normal de chaque catégorie (Special et Ultime ensemble). */
export const VALEUR_CATEGORIE: Record<CategorieEclats, number> = {
  /** Runes recyclables depuis le 2026-11-15 : une rune normale vaut une Commune. */
  rune: 1,
  /** Rune alt : 8 % des boosters (environ 1 sur 12, comme les Alt Art), valeur d'une Épique. */
  "rune-alt": 40,
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

/** Tokens : ni recyclables, ni fabricables (les runes le sont depuis le 2026-11-15). */
function estToken(carte: CarteEclats): boolean {
  return carte.variante === "token" || carte.type.toLowerCase() === "token";
}

function estRune(carte: CarteEclats): boolean {
  return ["rune", "rune_alt"].includes(carte.variante) || carte.type.toLowerCase() === "rune";
}

/** Catégorie de recyclage d'une carte (la variante prime sur la rareté), ou null si elle n'est pas recyclable. */
export function categorieEclats(carte: CarteEclats): CategorieEclats | null {
  if (estToken(carte)) return null;
  // Rune alt : variante rune_alt ou alt, ou rareté Showcase (selon les sets, voir classification-cartes.ts).
  if (estRune(carte)) return carte.variante === "rune_alt" || carte.variante === "alt" || carte.rarete === "Showcase" ? "rune-alt" : "rune";
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

/** Exemplaires toujours gardés de chaque carte : on ne recycle que ce qui dépasse. */
export const EXEMPLAIRES_PROTEGES = 1;

/**
 * Doublons recyclables d'une carte : tout ce qui dépasse les exemplaires protégés.
 * Les normales partent en premier, la foil est gardée le plus longtemps.
 */
export function doublonsDe(possede: Possede, proteges: number): Possede {
  const surplus = Math.max(0, possede.normale + possede.foil - proteges);
  const normale = Math.min(possede.normale, surplus);
  return { normale, foil: Math.min(possede.foil, surplus - normale) };
}
