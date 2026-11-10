/** Schéma des actions envoyées à la table de jeu (validé par la salle avant d'appeler le moteur). */
import { z } from "zod";

const schemaIdCarte = z.string().regex(/^c\d{1,4}$/);
const schemaIdZone = z.string().regex(/^([01]\.[a-z]{3,10}|champ\.\d)$/);

export const schemaAction = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("piocher"), n: z.number().int().min(1).max(10) }),
  z.strictObject({ type: z.literal("canaliser"), n: z.number().int().min(1).max(5) }),
  z.strictObject({ type: z.literal("melanger"), zone: z.enum(["deck", "runes"]) }),
  z.strictObject({
    type: z.literal("deplacer"),
    carte: schemaIdCarte,
    vers: schemaIdZone,
    position: z.enum(["dessus", "dessous"]).optional(),
    /** Jouer face cachée (seulement vers une zone en jeu). */
    cachee: z.boolean().optional(),
  }),
  // Aide automatique : début de tour, jouer une carte en payant avec les runes choisies, bouger une unité.
  z.strictObject({ type: z.literal("debutTour") }),
  z.strictObject({
    type: z.literal("jouer"),
    carte: schemaIdCarte,
    vers: schemaIdZone,
    /** L'unité arrive inclinée (un équipement arrive prêt). */
    inclinee: z.boolean().optional(),
    payer: z.strictObject({ incliner: z.array(schemaIdCarte).max(12), recycler: z.array(schemaIdCarte).max(12) }),
  }),
  z.strictObject({ type: z.literal("bouger"), carte: schemaIdCarte, vers: schemaIdZone }),
  z.strictObject({ type: z.literal("incliner"), carte: schemaIdCarte }),
  z.strictObject({ type: z.literal("retourner"), carte: schemaIdCarte }),
  z.strictObject({ type: z.literal("marqueur"), carte: schemaIdCarte, delta: z.number().int().min(-5).max(5) }),
  z.strictObject({ type: z.literal("redresser") }),
  z.strictObject({ type: z.literal("points"), delta: z.number().int().min(-5).max(5) }),
  z.strictObject({ type: z.literal("reveler"), carte: schemaIdCarte }),
  z.strictObject({ type: z.literal("mulligan"), cartes: z.array(schemaIdCarte).max(2) }),
  z.strictObject({
    type: z.literal("creerToken"),
    /** Un token du jeu (voir EtatTable.tokens)… */
    code: z.string().regex(/^[a-z0-9-]{3,40}$/).optional(),
    /** … ou un token libre, par son nom (« Bomb »). */
    libelle: z.string().trim().min(1).max(30).optional(),
    vers: schemaIdZone,
    n: z.number().int().min(1).max(5),
  }),
  z.strictObject({ type: z.literal("de") }),
  z.strictObject({ type: z.literal("dire"), texte: z.string().trim().min(1).max(200) }),
]);
