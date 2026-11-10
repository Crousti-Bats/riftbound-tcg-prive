/**
 * État de la bulle de discussion (en bas à droite de l'écran) : ouverte ou fermée, salon ou messages privés,
 * conversation privée ouverte. N'importe quelle page peut l'ouvrir (« Écrire à … ») avec `ouvrirChat`.
 */
import { useSyncExternalStore } from "react";

export interface EtatChat {
  ouvert: boolean;
  vue: "salon" | "prive";
  /** Conversation privée ouverte (null : liste des conversations). */
  avec: string | null;
}

let etat: EtatChat = { ouvert: false, vue: "salon", avec: null };
const abonnes = new Set<() => void>();

function publier(suivant: EtatChat) {
  etat = suivant;
  abonnes.forEach((f) => f());
}

export function useChat(): EtatChat {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => etat,
  );
}

/** Ouvre la bulle : sur le salon, sur la liste des messages privés, ou sur la conversation avec un joueur. */
export function ouvrirChat(cible: { vue: "salon" } | { vue: "prive"; avec?: string | null } = { vue: etat.vue }): void {
  const avec = cible.vue === "prive" ? (cible.avec ?? null) : null;
  publier({ ouvert: true, vue: cible.vue, avec: avec && /^[A-Za-z0-9_-]{3,20}$/.test(avec) ? avec : null });
}

export const ecrireA = (pseudo: string) => ouvrirChat({ vue: "prive", avec: pseudo });

export function fermerChat(): void {
  publier({ ...etat, ouvert: false });
}

export function changerVueChat(vue: EtatChat["vue"], avec: string | null = null): void {
  publier({ ...etat, vue, avec });
}
