/**
 * Bandeau d'annonce de l'admin, affiché en grand à tous les joueurs connectés.
 * - GET /api/annonce-site : l'annonce en cours (ou null), pour tout joueur connecté.
 * - La publication et le retrait sont des routes admin (routes-administration.ts), journalisées.
 * Texte brut uniquement (affiché par React, jamais interprété comme du HTML).
 */
import { Hono } from "hono";
import { z } from "zod";
import { exigerConnexion } from "../authentification/sessions";
import type { ContexteApi } from "../types-application";

export const LONGUEUR_MAX_ANNONCE = 300;
export const schemaAnnonceSite = z.strictObject({
  texte: z.string().trim().min(1, "annonce vide").max(LONGUEUR_MAX_ANNONCE, `${LONGUEUR_MAX_ANNONCE} caractères maximum`),
});

export const routesAnnonceSite = new Hono<ContexteApi>();

routesAnnonceSite.use("*", exigerConnexion);

routesAnnonceSite.get("/", async (c) => {
  const annonce = await c.env.BASE_DE_DONNEES.prepare(
    "SELECT id, texte, cree_le AS creeLe FROM annonce_site WHERE retiree_le IS NULL ORDER BY id DESC LIMIT 1",
  ).first<{ id: number; texte: string; creeLe: number }>();
  return c.json({ annonce: annonce ?? null });
});
