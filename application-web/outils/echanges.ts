/** Types et libellés des échanges, côté site. */
import type { Carte } from "./libelles-cartes";

export type StatutEchange = "en_attente" | "accepte" | "refuse" | "annule" | "expire" | "echoue";

export interface LigneEchangeVue {
  code: string;
  foil: boolean;
  quantite: number;
  carte: Carte | null;
}

export interface EchangeVue {
  id: number;
  auteur: string;
  destinataire: string;
  jeSuisAuteur: boolean;
  statut: StatutEchange;
  message: string | null;
  creeLe: number;
  expireLe: number;
  termineLe: number | null;
  /** Vu par l'auteur : ce qu'il donne. */
  donne: LigneEchangeVue[];
  /** Vu par l'auteur : ce qu'il demande. */
  demande: LigneEchangeVue[];
}

export interface ListesEchanges {
  recues: EchangeVue[];
  envoyees: EchangeVue[];
  historique: EchangeVue[];
}

/** Ligne du panier en cours de composition (nouvelle proposition). */
export interface LignePanier {
  carte: Carte;
  foil: boolean;
  quantite: number;
  /** Exemplaires disponibles (on ne peut pas proposer plus). */
  max: number;
}

export const cleLigne = (code: string, foil: boolean) => `${code}|${foil ? 1 : 0}`;

export const LIBELLES_STATUT: Record<StatutEchange, string> = {
  en_attente: "En attente",
  accepte: "Accepté ✅",
  refuse: "Refusé",
  annule: "Annulé",
  expire: "Expiré",
  echoue: "Échoué (cartes plus disponibles)",
};

/** Ce que JE reçois et ce que JE donne, quel que soit mon rôle dans l'échange. */
export function pointDeVue(e: EchangeVue): { jeRecois: LigneEchangeVue[]; jeDonne: LigneEchangeVue[]; autre: string } {
  return e.jeSuisAuteur
    ? { jeRecois: e.demande, jeDonne: e.donne, autre: e.destinataire }
    : { jeRecois: e.donne, jeDonne: e.demande, autre: e.auteur };
}
