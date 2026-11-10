/**
 * Aperçu d'un booster avant de l'ouvrir (demandé le 2026-11-10) :
 * - « Les plus rares » : les catégories Rare+ que ce set peut donner (Ultime → Epic), avec leur chance par booster ;
 * - « Il te manque » : les cartes de ce booster que le joueur n'a pas encore, les plus rares d'abord.
 *
 * Fonctions pures, calculées à partir des pools de tirage : l'aperçu montre exactement ce que le tirage peut donner.
 */
import type { CarteCatalogue } from "../catalogue/types-catalogue";
import { type CategorieRarePlus, TAUX_FOIL, TAUX_RARE_PLUS } from "./configuration-taux";
import type { PoolsSet } from "./pools";

export type CategorieApercu = Exclude<CategorieRarePlus, "rare">;

/** Pool de chaque catégorie Rare+, de la plus rare à la moins rare. */
const POOLS_RARE_PLUS: ReadonlyArray<{ categorie: CategorieApercu; pool: keyof PoolsSet }> = [
  { categorie: "ultime", pool: "ultime" },
  { categorie: "special", pool: "special" },
  { categorie: "signee", pool: "signee" },
  { categorie: "overnumbered", pool: "overnumbered" },
  { categorie: "alt", pool: "alt" },
  { categorie: "epic", pool: "epics" },
];

/** Toutes les cartes qu'un booster de ce set peut contenir, rangées de la plus rare à la moins rare. */
const ORDRE_POOLS: ReadonlyArray<keyof PoolsSet> = [
  "ultime",
  "special",
  "signee",
  "overnumbered",
  "alt",
  "epics",
  "rares",
  "uncommons",
  "commons",
  "runesAlt",
  "runes",
  "tokens",
];

const SLOTS_RARE_PLUS = 2;

/**
 * Chance d'obtenir au moins une carte de la catégorie dans un booster : 2 slots Rare+ indépendants,
 * plus le slot Foil pour les Epic. Renvoyée sous la forme « 1 booster sur N ».
 */
export function unBoosterSur(categorie: CategorieApercu): number {
  const p = TAUX_RARE_PLUS.find((t) => t.categorie === categorie)?.p ?? 0;
  let aucune = (1 - p) ** SLOTS_RARE_PLUS;
  if (categorie === "epic") aucune *= 1 - (TAUX_FOIL.find((t) => t.rarete === "Epic")?.p ?? 0);
  const auMoinsUne = 1 - aucune;
  return auMoinsUne > 0 ? Math.round(1 / auMoinsUne) : 0;
}

export interface GroupeRare {
  categorie: CategorieApercu;
  unBoosterSur: number;
  codes: string[];
}

/** Catégories Rare+ présentes dans ce set (une catégorie vide est reversée aux Rares par le tirage). */
export function plusRares(pools: PoolsSet): GroupeRare[] {
  return POOLS_RARE_PLUS.filter(({ pool }) => pools[pool].length > 0).map(({ categorie, pool }) => ({
    categorie,
    unBoosterSur: unBoosterSur(categorie),
    codes: [...pools[pool]],
  }));
}

/** Cartes du booster que le joueur n'a pas (ni normale ni foil), les plus rares d'abord ; total = cartes du booster. */
export function cartesManquantes(pools: PoolsSet, possedees: ReadonlySet<string>): { total: number; manquantes: string[] } {
  const vues = new Set<string>();
  const manquantes: string[] = [];
  for (const nom of ORDRE_POOLS) {
    for (const code of pools[nom]) {
      if (vues.has(code)) continue;
      vues.add(code);
      if (!possedees.has(code)) manquantes.push(code);
    }
  }
  return { total: vues.size, manquantes };
}

/** Tous les cardCode qu'un booster de ce set peut contenir. */
export function codesDuBooster(pools: PoolsSet): Set<string> {
  return new Set(ORDRE_POOLS.flatMap((nom) => pools[nom]));
}

/** Carte enrichie pour l'affichage : quantités possédées et présence dans ma wishlist. */
export function carteApercu(
  carte: CarteCatalogue,
  possession: ReadonlyMap<string, { normale: number; foil: number }>,
  wishlist: ReadonlySet<string>,
) {
  const p = possession.get(carte.code);
  return { ...carte, quantite: p?.normale ?? 0, quantiteFoil: p?.foil ?? 0, enWishlist: wishlist.has(carte.code) };
}
