/** Types et outils des profils de joueurs (avatar, bio, vitrine). */
import type { Carte } from "./libelles-cartes";

export const TAILLE_VITRINE = 6;
export const LONGUEUR_BIO = 200;

/** Avatar tel que renvoyé à côté d'un message ou d'une annonce : juste l'image. */
export interface AvatarLeger {
  image: string;
  orientation: Carte["orientation"];
  /** Photo personnelle : affichée telle quelle (pas de zoom sur l'illustration d'une carte). */
  photo?: true;
}

export interface ProfilJoueur {
  pseudo: string;
  estMoi: boolean;
  peutModerer: boolean;
  membreDepuis: number;
  bio: string;
  avatar: Carte | null;
  /** Adresse de la photo personnelle ; si elle existe, elle s'affiche à la place de la carte. */
  photo: string | null;
  vitrine: Array<{ carte: Carte; foil: boolean }>;
  /** Cartes recherchées pas encore obtenues ; `jePossede` = exemplaires que le visiteur possède. */
  wishlist: Array<{ carte: Carte; jePossede: number }>;
  statistiques: {
    totalCartes: number;
    cartesDistinctes: number;
    boostersOuverts: number;
    echangesReussis: number;
    completion: Array<{ code: string; nom: string; possedees: number; total: number }>;
  };
}

/** Avatar affiché : la photo personnelle si elle existe, sinon la carte choisie. */
export function avatarDuProfil(photo: string | null, carte: Carte | null): AvatarLeger | null {
  if (photo) return { image: photo, orientation: "portrait", photo: true };
  return carte;
}

export const lienProfil = (pseudo: string) => `/profil/${encodeURIComponent(pseudo)}`;

/** Prévient la barre de navigation que mon avatar a changé. */
const EVENEMENT_PROFIL = "profil-modifie";
export const signalerProfilModifie = () => window.dispatchEvent(new Event(EVENEMENT_PROFIL));
export function surProfilModifie(rappel: () => void): () => void {
  window.addEventListener(EVENEMENT_PROFIL, rappel);
  return () => window.removeEventListener(EVENEMENT_PROFIL, rappel);
}
