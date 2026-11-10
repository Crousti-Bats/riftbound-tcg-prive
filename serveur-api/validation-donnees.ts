/** Schémas de validation (Zod) de tout ce que le navigateur envoie. Tout ce qui n'est pas prévu est refusé. */
import { z } from "zod";

export const schemaPseudo = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{3,20}$/, "3 à 20 caractères : lettres, chiffres, _ ou -");

/** 6 caractères minimum (choix de l'utilisateur le 2026-11-08, compensé par la limitation des tentatives), 128 maximum (évite les calculs abusifs). */
export const schemaMotDePasse = z.string().min(6, "6 caractères minimum").max(128, "128 caractères maximum");

/** Code d'invitation : jeton base64url de 32 octets → 43 caractères. */
export const schemaCodeInvitation = z.string().trim().regex(/^[A-Za-z0-9_-]{20,64}$/, "code invalide");

export const schemaInscription = z.strictObject({
  code: schemaCodeInvitation,
  pseudo: schemaPseudo,
  motDePasse: schemaMotDePasse,
});

export const schemaReinitialisationMotDePasse = z.strictObject({
  code: schemaCodeInvitation,
  motDePasse: schemaMotDePasse,
});

export const schemaConnexion = z.strictObject({
  pseudo: z.string().trim().min(1).max(20),
  motDePasse: z.string().min(1).max(128),
});

export const schemaElevation = z.strictObject({
  motDePasse: z.string().min(1).max(128),
});

export const schemaCreationInvitation = z.strictObject({
  note: z.string().trim().max(100).optional(),
  pseudoReserve: schemaPseudo.optional(),
  dureeHeures: z.number().int().min(1).max(168).default(48),
});

export const schemaIdentifiant = z.coerce.number().int().positive();

export const schemaLimiteJournal = z.coerce.number().int().min(1).max(500).default(100);
