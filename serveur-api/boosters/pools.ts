/**
 * Pré-indexe les cartes du catalogue en « pools » de tirage, par set.
 * On ne garde que les cardCode (jamais les données de carte) : l'enrichissement pour l'affichage
 * se fait ensuite par recherche dans le catalogue.
 *
 * Décisions (doc §4, tranchées avec l'utilisateur) :
 * - Les Légendes (type Legend, rareté Rare) et les Terrains (type Battlefield, rareté Uncommon)
 *   entrent dans leurs pools de rareté normaux.
 * - On exclut les Runes et Tokens des pools de rareté (ils ont leur propre slot).
 */
import type { Catalogue } from "../catalogue/types-catalogue";

export interface PoolsSet {
  commons: string[];
  uncommons: string[];
  rares: string[];
  epics: string[];
  alt: string[];
  overnumbered: string[];
  signee: string[];
  special: string[];
  ultime: string[];
  runes: string[];
  runesAlt: string[];
  tokens: string[];
}

export interface Pools {
  parSet: Record<string, PoolsSet>;
  /** Runes d'Origins, utilisées en dernier recours pour un set sans rune ni token. */
  runesOrigins: string[];
}

const SET_ORIGINS = "ogn";

function poolsVides(): PoolsSet {
  return {
    commons: [],
    uncommons: [],
    rares: [],
    epics: [],
    alt: [],
    overnumbered: [],
    signee: [],
    special: [],
    ultime: [],
    runes: [],
    runesAlt: [],
    tokens: [],
  };
}

function construire(catalogue: Catalogue): Pools {
  const parSet: Record<string, PoolsSet> = {};
  for (const carte of catalogue.cartes) {
    const set = (parSet[carte.set] ??= poolsVides());
    const estRune = carte.type.toLowerCase() === "rune";
    const estToken = carte.variante === "token";

    switch (carte.variante) {
      case "base":
        if (estRune) set.runes.push(carte.code);
        else if (!estToken) {
          if (carte.rarete === "Common") set.commons.push(carte.code);
          else if (carte.rarete === "Uncommon") set.uncommons.push(carte.code);
          else if (carte.rarete === "Rare") set.rares.push(carte.code);
          else if (carte.rarete === "Epic") set.epics.push(carte.code);
        }
        break;
      case "alt":
        set.alt.push(carte.code);
        break;
      case "overnumbered":
        set.overnumbered.push(carte.code);
        break;
      case "signee":
        set.signee.push(carte.code);
        break;
      case "special":
        set.special.push(carte.code);
        break;
      case "ultime":
        set.ultime.push(carte.code);
        break;
      case "rune":
        set.runes.push(carte.code);
        break;
      case "rune_alt":
        set.runesAlt.push(carte.code);
        break;
      case "token":
        set.tokens.push(carte.code);
        break;
    }
  }
  return { parSet, runesOrigins: parSet[SET_ORIGINS]?.runes ?? [] };
}

// Mémoïsation : on ne reconstruit les pools que lorsque le catalogue change (clé = chargeLe).
let cache: { cle: number; pools: Pools } | null = null;

export function construirePools(catalogue: Catalogue): Pools {
  if (cache && cache.cle === catalogue.chargeLe) return cache.pools;
  const pools = construire(catalogue);
  cache = { cle: catalogue.chargeLe, pools };
  return pools;
}

/** Pour les tests : oublie les pools mémoïsés. */
export function viderCachePools(): void {
  cache = null;
}
