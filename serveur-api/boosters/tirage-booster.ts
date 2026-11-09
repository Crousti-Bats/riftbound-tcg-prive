/**
 * Tirage d'un booster : fonction PURE (pools + set + source d'aléatoire → 14 cartes).
 * Pure ⇒ testable exhaustivement et reproductible avec un aléatoire seedé.
 * Les doublons à l'intérieur d'un même booster sont autorisés (tirages indépendants, décision §4).
 */
import { type Aleatoire, tirageCumulatif } from "./aleatoire";
import { COMPOSITION, PROBA_RUNE_ALT, TAUX_FOIL, TAUX_RARE_PLUS } from "./configuration-taux";
import type { Pools, PoolsSet } from "./pools";

export type NomSlot = "common" | "uncommon" | "foil" | "rarePlus" | "runeToken";

export interface CarteTiree {
  code: string;
  foil: boolean;
  slot: NomSlot;
}

/** Premier pool non vide parmi ceux proposés (replis de sécurité pour toujours produire une carte). */
function premierNonVide(...pools: string[][]): string[] {
  for (const pool of pools) if (pool.length > 0) return pool;
  return [];
}

/** Choisit un code au hasard dans un pool supposé non vide. */
function tirer(pool: string[], alea: Aleatoire): string {
  return pool[Math.floor(alea() * pool.length)] ?? pool[0] ?? "";
}

function poolParRarete(set: PoolsSet, rarete: "Common" | "Uncommon" | "Rare" | "Epic"): string[] {
  switch (rarete) {
    case "Common":
      return set.commons;
    case "Uncommon":
      return set.uncommons;
    case "Rare":
      return set.rares;
    case "Epic":
      return set.epics;
  }
}

function poolRarePlus(set: PoolsSet, categorie: (typeof TAUX_RARE_PLUS)[number]["categorie"]): string[] {
  switch (categorie) {
    case "epic":
      return set.epics;
    case "alt":
      return set.alt;
    case "overnumbered":
      return set.overnumbered;
    case "signee":
      return set.signee;
    case "special":
      return set.special;
    case "ultime":
      return set.ultime;
  }
}

function tirerRarePlus(set: PoolsSet, alea: Aleatoire): CarteTiree {
  const choix = tirageCumulatif(TAUX_RARE_PLUS, alea);
  // Pas de catégorie touchée, ou catégorie absente du set → Rare (la masse est reversée aux Rares).
  const vise = choix ? poolRarePlus(set, choix.categorie) : [];
  const pool = premierNonVide(vise, set.rares, set.epics, set.uncommons, set.commons);
  return { code: tirer(pool, alea), foil: false, slot: "rarePlus" };
}

function tirerRuneToken(set: PoolsSet, pools: Pools, alea: Aleatoire): CarteTiree {
  // Le set a-t-il des runes ? (les runes d'Origins sont des cartes de variante "base", type Rune)
  if (set.runes.length > 0 || set.runesAlt.length > 0) {
    const veutAlt = alea() < PROBA_RUNE_ALT;
    const pool = veutAlt ? premierNonVide(set.runesAlt, set.runes) : premierNonVide(set.runes, set.runesAlt);
    return { code: tirer(pool, alea), foil: false, slot: "runeToken" };
  }
  // Sinon, un Token du set (Spiritforged, Unleashed).
  if (set.tokens.length > 0) {
    return { code: tirer(set.tokens, alea), foil: false, slot: "runeToken" };
  }
  // En dernier recours, une Rune d'Origins.
  const pool = premierNonVide(pools.runesOrigins, set.tokens, set.commons);
  return { code: tirer(pool, alea), foil: false, slot: "runeToken" };
}

export function tirerBooster(pools: Pools, setCode: string, alea: Aleatoire): CarteTiree[] {
  const set = pools.parSet[setCode];
  if (!set) throw new Error(`set inconnu pour le tirage : ${setCode}`);

  const cartes: CarteTiree[] = [];

  for (let i = 0; i < COMPOSITION.common; i++) {
    cartes.push({ code: tirer(premierNonVide(set.commons, set.uncommons), alea), foil: false, slot: "common" });
  }
  for (let i = 0; i < COMPOSITION.uncommon; i++) {
    cartes.push({ code: tirer(premierNonVide(set.uncommons, set.commons), alea), foil: false, slot: "uncommon" });
  }

  // Slot Foil : rareté tirée selon TAUX_FOIL, carte normale rendue « brillante ».
  const rareteFoil = tirageCumulatif(TAUX_FOIL, alea)?.rarete ?? "Common";
  const poolFoil = premierNonVide(poolParRarete(set, rareteFoil), set.commons, set.uncommons, set.rares, set.epics);
  cartes.push({ code: tirer(poolFoil, alea), foil: true, slot: "foil" });

  for (let i = 0; i < COMPOSITION.rarePlus; i++) {
    cartes.push(tirerRarePlus(set, alea));
  }

  cartes.push(tirerRuneToken(set, pools, alea));

  return cartes;
}
