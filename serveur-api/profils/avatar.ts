/**
 * Avatar d'un joueur tel qu'il s'affiche partout (navigation, profil, salon, marché) :
 * sa photo personnelle si elle existe, sinon l'illustration de sa carte choisie, sinon rien (initiale).
 */
import type { CarteCatalogue } from "../catalogue/types-catalogue";

export interface AvatarAffiche {
  image: string;
  orientation: "portrait" | "paysage";
  /** Photo personnelle (affichée telle quelle, sans le zoom sur l'illustration d'une carte). */
  photo?: true;
}

/** Adresse de la photo : la version (date d'envoi) change à chaque nouvelle photo, donc pas de cache périmé. */
export const urlPhoto = (compteId: number, version: number) => `/api/profils/photo/${compteId}?v=${version}`;

export function avatarAffiche(
  parCode: ReadonlyMap<string, CarteCatalogue>,
  joueur: { id: number; carte: string | null; photoLe: number | null },
): AvatarAffiche | null {
  if (joueur.photoLe) return { image: urlPhoto(joueur.id, joueur.photoLe), orientation: "portrait", photo: true };
  const carte = joueur.carte ? parCode.get(joueur.carte) : undefined;
  return carte ? { image: carte.image, orientation: carte.orientation } : null;
}

const SIGNATURES: ReadonlyArray<{ type: "image/jpeg" | "image/png" | "image/webp"; verifier: (o: Uint8Array) => boolean }> = [
  { type: "image/jpeg", verifier: (o) => o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff },
  { type: "image/png", verifier: (o) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => o[i] === v) },
  {
    type: "image/webp",
    verifier: (o) => String.fromCharCode(...o.subarray(0, 4)) === "RIFF" && String.fromCharCode(...o.subarray(8, 12)) === "WEBP",
  },
];

export const TAILLE_MAX_PHOTO = 150 * 1024;

/**
 * Vérifie une photo envoyée en base64 : décodable, 150 Ko au plus, et vraiment une image JPEG, PNG ou WebP
 * (signature des premiers octets, on ne croit pas le type annoncé). SVG, HTML, GIF… sont refusés.
 */
export function verifierPhoto(base64: string): { type: (typeof SIGNATURES)[number]["type"]; base64: string } | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  let octets: Uint8Array;
  try {
    octets = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (octets.length < 12 || octets.length > TAILLE_MAX_PHOTO) return null;
  const signature = SIGNATURES.find((s) => s.verifier(octets));
  return signature ? { type: signature.type, base64 } : null;
}
