/**
 * Aide automatique de la table : choisir les runes qui paient une carte.
 * Énergie : incliner autant de runes prêtes. Puissance : recycler (remettre sous le deck de runes) une rune du domaine
 * de la carte par symbole ; une rune peut être inclinée pour l'énergie puis recyclée pour la puissance.
 * Le moteur (action « jouer ») vérifie seulement que ces runes sont bien à moi, dans ma réserve, et prêtes pour l'énergie.
 */
import type { Carte } from "./libelles-cartes";

export interface RuneReserve {
  id: string;
  code: string | null;
  inclinee: boolean;
}

export type Paiement = { ok: true; incliner: string[]; recycler: string[] } | { ok: false; raison: string };

/** Coût lisible : « 4 énergie + 1 Chaos ». */
export function libelleCout(carte: Carte): string {
  const morceaux: string[] = [];
  if (carte.energie) morceaux.push(`${carte.energie} énergie`);
  if (carte.puissance) morceaux.push(`${carte.puissance} ${carte.domaines.join(" ou ") || "puissance"}`);
  return morceaux.join(" + ") || "gratuite";
}

export function calculerPaiement(carte: Carte, reserve: RuneReserve[], cartes: Record<string, Carte>): Paiement {
  const energie = carte.energie ?? 0;
  const puissance = carte.puissance ?? 0;
  const domaineDe = (r: RuneReserve) => (r.code ? cartes[r.code]?.domaines ?? [] : []);
  const pretes = reserve.filter((r) => !r.inclinee);
  if (pretes.length < energie) {
    return { ok: false, raison: `Il faut ${energie} rune${energie > 1 ? "s" : ""} prête${energie > 1 ? "s" : ""}, tu en as ${pretes.length}.` };
  }
  // Puissance : runes du bon domaine, d'abord celles déjà inclinées (elles ne servent plus à rien ce tour-ci),
  // puis des runes prêtes (qu'on inclinera aussi pour l'énergie avant de les recycler).
  const duDomaine = reserve.filter((r) => domaineDe(r).some((d) => carte.domaines.includes(d)));
  const recycler = [...duDomaine.filter((r) => r.inclinee), ...duDomaine.filter((r) => !r.inclinee)].slice(0, puissance);
  if (recycler.length < puissance) {
    return { ok: false, raison: `Il faut ${puissance} rune${puissance > 1 ? "s" : ""} ${carte.domaines.join(" ou ")} à recycler, tu en as ${recycler.length}.` };
  }
  // Énergie : d'abord les runes prêtes qui seront recyclées de toute façon, puis les autres.
  const aRecycler = new Set(recycler.map((r) => r.id));
  const incliner = [...pretes.filter((r) => aRecycler.has(r.id)), ...pretes.filter((r) => !aRecycler.has(r.id))].slice(0, energie);
  return { ok: true, incliner: incliner.map((r) => r.id), recycler: recycler.map((r) => r.id) };
}
