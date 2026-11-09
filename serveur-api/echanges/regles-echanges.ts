/**
 * Règles des échanges (décidées par l'utilisateur le 2026-11-09) :
 * - plusieurs cartes contre plusieurs cartes ;
 * - dons autorisés (un des deux côtés peut être vide, mais pas les deux) ;
 * - on peut parcourir toute la collection des autres joueurs ;
 * - une proposition expire au bout de 48 heures.
 * Les limites ci-dessous évitent les abus (propositions géantes, spam).
 */
import { z } from "zod";
import { schemaPseudo } from "../validation-donnees";

export const DUREE_VALIDITE_MS = 48 * 60 * 60_000;
export const MAX_LIGNES_PAR_COTE = 20;
export const MAX_EXEMPLAIRES_PAR_COTE = 60;
export const MAX_PROPOSITIONS_EN_ATTENTE = 20;

export type Sens = "donne" | "demande";
export type StatutEchange = "en_attente" | "accepte" | "refuse" | "annule" | "expire" | "echoue";

const schemaLigne = z.strictObject({
  code: z.string().regex(/^[a-z0-9-]{3,40}$/),
  foil: z.boolean(),
  quantite: z.number().int().min(1).max(99),
});
export type LigneEchange = z.infer<typeof schemaLigne>;

function sansDoublon(lignes: LigneEchange[]): boolean {
  const vues = new Set(lignes.map((l) => `${l.code}|${l.foil}`));
  return vues.size === lignes.length;
}

const schemaCote = z
  .array(schemaLigne)
  .max(MAX_LIGNES_PAR_COTE, `${MAX_LIGNES_PAR_COTE} cartes différentes maximum par côté`)
  .refine(sansDoublon, "une même carte apparaît deux fois")
  .refine((l) => l.reduce((t, x) => t + x.quantite, 0) <= MAX_EXEMPLAIRES_PAR_COTE, `${MAX_EXEMPLAIRES_PAR_COTE} exemplaires maximum par côté`);

export const schemaProposition = z
  .strictObject({
    destinataire: schemaPseudo,
    donne: schemaCote,
    demande: schemaCote,
    message: z.string().trim().max(200).optional(),
  })
  .refine((p) => p.donne.length + p.demande.length > 0, { message: "l'échange est vide", path: ["donne"] });

export type Proposition = z.infer<typeof schemaProposition>;

/** Une contrainte CHECK (quantite >= 0) violée pendant l'acceptation = une carte n'est plus disponible. */
export function estErreurStockInsuffisant(err: unknown): boolean {
  return /CHECK constraint failed/i.test(String(err instanceof Error ? err.message : err));
}
