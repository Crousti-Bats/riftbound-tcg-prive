/**
 * Stock de boosters : calcul PARESSEUX, sans tâche planifiée (aucun coût).
 * On stocke en base (stockSauve, tick). Le stock réel se recalcule à la lecture :
 *   stock = min(15, stockSauve + floor((maintenant - tick) / 10 min)).
 */
import { INTERVALLE_REGEN_MS, STOCK_MAX } from "./configuration-taux";

export interface EtatStock {
  stock: number;
  /** Instant de référence pour la prochaine régénération (ms). */
  tick: number;
}

/**
 * Recalcule le stock à partir de l'état sauvegardé.
 * - Au plafond : le minuteur est à l'arrêt, le tick est remis à « maintenant ».
 * - Sinon : le tick avance des intervalles entiers consommés (la progression partielle est préservée).
 */
export function regenerer(stockSauve: number, tick: number, maintenant: number): EtatStock {
  if (stockSauve >= STOCK_MAX) return { stock: STOCK_MAX, tick: maintenant };
  const ecoule = maintenant - tick;
  const gagnes = ecoule > 0 ? Math.floor(ecoule / INTERVALLE_REGEN_MS) : 0;
  const stock = Math.min(STOCK_MAX, stockSauve + gagnes);
  if (stock >= STOCK_MAX) return { stock: STOCK_MAX, tick: maintenant };
  return { stock, tick: tick + gagnes * INTERVALLE_REGEN_MS };
}

/** Temps en ms avant le prochain booster, ou null si le stock est au plafond. */
export function prochainDansMs(etat: EtatStock, maintenant: number): number | null {
  if (etat.stock >= STOCK_MAX) return null;
  return Math.max(0, etat.tick + INTERVALLE_REGEN_MS - maintenant);
}
