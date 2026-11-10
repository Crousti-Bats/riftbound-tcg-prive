/**
 * Routes /api/wishlist : les cartes que je recherche (demandé le 2026-11-10).
 * Chaque carte de ma wishlist que je ne possède pas apparaît dans « Qui a ? » au marché (voir routes-marche.ts),
 * sans message dans le salon. Dès que je l'obtiens, elle n'y apparaît plus (filtrée à la lecture).
 * Seulement des cardCode en base ; 100 cartes au maximum par joueur.
 */
import { Hono } from "hono";
import { z } from "zod";
import { exigerConnexion } from "../authentification/sessions";
import { obtenirCatalogue } from "../catalogue/source-cartes";
import { lireCorps } from "../lecture-requete";
import { compterTentative, REGLES } from "../securite/limitation-tentatives";
import type { ContexteApi } from "../types-application";

export const routesWishlist = new Hono<ContexteApi>();

routesWishlist.use("*", exigerConnexion);

export const MAX_WISHLIST = 100;

const schemaCode = z.string().regex(/^[a-z0-9-]{3,40}$/);

/** Ma wishlist, la plus récente d'abord, avec ce que je possède déjà de chaque carte. */
routesWishlist.get("/", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const base = c.env.BASE_DE_DONNEES;
  const [souhaits, possession] = await base.batch([
    base.prepare("SELECT card_code, ajoutee_le FROM wishlist WHERE compte_id = ? ORDER BY ajoutee_le DESC").bind(compte.id),
    base
      .prepare("SELECT card_code, SUM(quantite) AS n FROM collection WHERE compte_id = ? AND quantite > 0 GROUP BY card_code")
      .bind(compte.id),
  ]);
  const possede = new Map((possession?.results as Array<{ card_code: string; n: number }>).map((r) => [r.card_code, r.n]));
  const parCode = new Map((await obtenirCatalogue()).cartes.map((carte) => [carte.code, carte]));
  const cartes = (souhaits?.results as Array<{ card_code: string; ajoutee_le: number }>).flatMap((s) => {
    const carte = parCode.get(s.card_code);
    return carte ? [{ carte, ajouteeLe: s.ajoutee_le, possedee: possede.get(s.card_code) ?? 0 }] : [];
  });
  return c.json({ cartes, max: MAX_WISHLIST });
});

routesWishlist.post("/", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const base = c.env.BASE_DE_DONNEES;
  const lecture = await lireCorps(c, z.strictObject({ code: schemaCode }));
  if (!lecture.ok) return lecture.reponse;
  const { code } = lecture.donnees;
  if (!(await obtenirCatalogue()).cartes.some((carte) => carte.code === code)) return c.json({ erreur: "carte_introuvable" }, 404);

  if (!(await compterTentative(base, `wishlist:compte:${compte.id}`, REGLES.wishlistParCompte)).autorisee) {
    return c.json({ erreur: "trop_de_modifications" }, 429);
  }
  // Plafond vérifié dans la même requête que l'insertion (pas de dépassement avec des ajouts simultanés).
  const ajout = await base
    .prepare(
      `INSERT INTO wishlist (compte_id, card_code, ajoutee_le)
       SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM wishlist WHERE compte_id = ?) < ?
       ON CONFLICT (compte_id, card_code) DO NOTHING`,
    )
    .bind(compte.id, code, Date.now(), compte.id, MAX_WISHLIST)
    .run();
  if (!ajout.meta.changes) {
    const deja = await base
      .prepare("SELECT 1 AS present FROM wishlist WHERE compte_id = ? AND card_code = ?")
      .bind(compte.id, code)
      .first();
    if (!deja) return c.json({ erreur: "wishlist_pleine" }, 409);
  }
  return c.json({ ok: true }, 201);
});

routesWishlist.delete("/:code", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const code = schemaCode.safeParse(c.req.param("code"));
  if (!code.success) return c.json({ erreur: "introuvable" }, 404);
  await c.env.BASE_DE_DONNEES.prepare("DELETE FROM wishlist WHERE compte_id = ? AND card_code = ?").bind(compte.id, code.data).run();
  return c.json({ ok: true });
});
