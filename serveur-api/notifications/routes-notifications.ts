/**
 * Routes /api/notifications : abonnement du navigateur aux notifications push (« tes boosters sont pleins »).
 * Le navigateur crée lui-même l'abonnement (après l'accord du joueur) et nous envoie son adresse et ses clés publiques.
 */
import { Hono } from "hono";
import { z } from "zod";
import { exigerConnexion } from "../authentification/sessions";
import { lireCorps } from "../lecture-requete";
import { compterTentative } from "../securite/limitation-tentatives";
import type { ContexteApi } from "../types-application";
import { clesVapid } from "./cles-vapid";
import { envoyerNotification, estEndpointAutorise } from "./web-push";

export const routesNotifications = new Hono<ContexteApi>();

routesNotifications.use("*", exigerConnexion);

/** Au-delà, les plus anciens abonnements du compte sont oubliés (vieux téléphones, navigateurs effacés). */
export const MAX_ABONNEMENTS_PAR_COMPTE = 10;

const schemaEndpoint = z.string().max(1000).refine(estEndpointAutorise, "service de notification inconnu");
const schemaAbonnement = z.strictObject({
  endpoint: schemaEndpoint,
  // Clé publique P-256 non compressée (65 octets) et secret de 16 octets, en base64url.
  p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
  auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
});
const schemaDesabonnement = z.strictObject({ endpoint: z.string().max(1000) });

routesNotifications.get("/cle-publique", (c) => {
  const cles = clesVapid(c.env);
  if (!cles) return c.json({ erreur: "notifications_non_configurees" }, 503);
  return c.json({ clePublique: cles.publique });
});

routesNotifications.post("/abonnement", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const lecture = await lireCorps(c, schemaAbonnement);
  if (!lecture.ok) return lecture.reponse;
  const { endpoint, p256dh, auth } = lecture.donnees;
  const base = c.env.BASE_DE_DONNEES;
  await base.batch([
    // Un navigateur partagé passe au compte qui s'y abonne en dernier.
    base
      .prepare(
        `INSERT INTO abonnements_push (endpoint, compte_id, p256dh, auth, cree_le) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (endpoint) DO UPDATE SET compte_id = excluded.compte_id, p256dh = excluded.p256dh,
           auth = excluded.auth, cree_le = excluded.cree_le`,
      )
      .bind(endpoint, compte.id, p256dh, auth, Date.now()),
    base
      .prepare(
        `DELETE FROM abonnements_push WHERE compte_id = ? AND endpoint NOT IN (
           SELECT endpoint FROM abonnements_push WHERE compte_id = ? ORDER BY cree_le DESC LIMIT ?)`,
      )
      .bind(compte.id, compte.id, MAX_ABONNEMENTS_PAR_COMPTE),
  ]);
  return c.json({ ok: true }, 201);
});

routesNotifications.post("/desabonnement", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const lecture = await lireCorps(c, schemaDesabonnement);
  if (!lecture.ok) return lecture.reponse;
  await c.env.BASE_DE_DONNEES.prepare("DELETE FROM abonnements_push WHERE endpoint = ? AND compte_id = ?")
    .bind(lecture.donnees.endpoint, compte.id)
    .run();
  return c.json({ ok: true });
});

/** Envoie une notification d'essai à tous les appareils abonnés du joueur (5 essais par heure). */
routesNotifications.post("/test", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const cles = clesVapid(c.env);
  if (!cles) return c.json({ erreur: "notifications_non_configurees" }, 503);
  const base = c.env.BASE_DE_DONNEES;
  if (!(await compterTentative(base, `notification-test:compte:${compte.id}`, { maximum: 5, fenetreMs: 60 * 60_000 })).autorisee) {
    return c.json({ erreur: "trop_de_tentatives" }, 429);
  }
  const { results } = await base
    .prepare("SELECT endpoint, p256dh, auth FROM abonnements_push WHERE compte_id = ?")
    .bind(compte.id)
    .all<{ endpoint: string; p256dh: string; auth: string }>();
  if (!results.length) return c.json({ erreur: "aucun_abonnement" }, 404);
  let envoyes = 0;
  for (const abonnement of results) {
    const resultat = await envoyerNotification(
      abonnement,
      { titre: "Notifications activées", texte: "Tu seras prévenu ici quand tes boosters seront à 15/15.", url: "/" },
      cles,
    );
    if (resultat === "envoye") envoyes++;
    if (resultat === "abonnement_perime") {
      await base.prepare("DELETE FROM abonnements_push WHERE endpoint = ?").bind(abonnement.endpoint).run();
    }
  }
  return c.json({ envoyes, appareils: results.length });
});
