/**
 * Source d'aléatoire injectable.
 * - En production : crypto.getRandomValues (non prédictible, côté serveur uniquement : le client ne peut pas tricher).
 * - Dans les tests : un PRNG déterministe (mulberry32) pour des résultats reproductibles (pas de test instable).
 */

/** Renvoie un nombre dans [0, 1). */
export type Aleatoire = () => number;

const DIVISEUR = 2 ** 32;

/** Aléatoire cryptographique (production). */
export function aleatoireCrypto(): Aleatoire {
  return () => {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return (buffer[0] ?? 0) / DIVISEUR;
  };
}

/** PRNG déterministe, UNIQUEMENT pour les tests (jamais pour un vrai tirage). */
export function aleatoireSeede(graine: number): Aleatoire {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / DIVISEUR;
  };
}

/** Tirage pondéré cumulatif : renvoie l'entrée touchée, ou null pour « le reste ». La somme des p doit être < 1. */
export function tirageCumulatif<T extends { p: number }>(table: readonly T[], alea: Aleatoire): T | null {
  const r = alea();
  let cumul = 0;
  for (const entree of table) {
    cumul += entree.p;
    if (r < cumul) return entree;
  }
  return null;
}
