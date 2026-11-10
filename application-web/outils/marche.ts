/** Types et outils du marché : annonces « Qui a ? / Qui veut ? », salon et messages privés. */
import type { Carte } from "./libelles-cartes";

export type TypeAnnonce = "cherche" | "propose";

export interface Annonce {
  id: number;
  type: TypeAnnonce;
  auteur: string;
  estMoi: boolean;
  foil: boolean;
  note: string | null;
  creeLe: number;
  carte: Carte;
  /** Nombre d'exemplaires de cette carte que JE possède (normaux + foil). */
  jePossede: number;
}

export interface MessageVue {
  id: number;
  auteur: string;
  estMoi: boolean;
  peutSupprimer: boolean;
  texte: string;
  creeLe: number;
  annonce: { id: number; type: TypeAnnonce; foil: boolean; active: boolean; carte: Carte | null } | null;
}

export interface ConversationVue {
  avec: string;
  dernierMessage: string;
  deMoi: boolean;
  creeLe: number;
  nonLus: number;
}

export const LIBELLES_ANNONCE: Record<TypeAnnonce, { titre: string; court: string }> = {
  cherche: { titre: "Qui a ?", court: "Je cherche" },
  propose: { titre: "Qui veut ?", court: "Je propose" },
};

/** Lien vers « Nouvel échange » pré-rempli à partir d'une annonce d'un autre joueur. */
export function lienEchangeDepuisAnnonce(a: Pick<Annonce, "type" | "auteur" | "foil"> & { carte: Pick<Carte, "code"> }): string {
  const ligne = `${a.carte.code}:${a.foil ? 1 : 0}`;
  // « Qui a ? » : je lui donne la carte qu'il cherche. « Qui veut ? » : je lui demande la carte qu'il propose.
  const cle = a.type === "cherche" ? "donne" : "demande";
  return `/echanges/nouveau?avec=${encodeURIComponent(a.auteur)}&${cle}=${encodeURIComponent(ligne)}`;
}

/** « à l'instant », « il y a 5 min », « 14:32 » (aujourd'hui) ou « 12/11 14:32 ». */
export function heureMessage(horodatage: number, maintenant = Date.now()): string {
  const ecart = maintenant - horodatage;
  if (ecart < 60_000) return "à l'instant";
  if (ecart < 60 * 60_000) return `il y a ${Math.floor(ecart / 60_000)} min`;
  const d = new Date(horodatage);
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (new Date(maintenant).toDateString() === d.toDateString()) return heure;
  return `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${heure}`;
}
