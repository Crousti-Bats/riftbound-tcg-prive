/**
 * Sessions de connexion.
 * - Le navigateur reçoit un jeton aléatoire de 256 bits dans un cookie __Host-session
 *   (HttpOnly : inaccessible au JavaScript ; Secure : HTTPS uniquement ; SameSite=Strict : anti-CSRF).
 * - La base ne stocke que l'empreinte SHA-256 du jeton.
 * - Durée : 7 jours glissants, 30 jours maximum. Accès admin : 15 minutes glissantes après re-saisie du mot de passe.
 */
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { empreinteSha256, jetonAleatoire } from "../securite/jetons-et-empreintes";
import type { ContexteApi, Role } from "../types-application";

export const NOM_COOKIE = "__Host-session";
export const DUREE_SESSION_MS = 7 * 24 * 60 * 60_000;
export const DUREE_MAX_SESSION_MS = 30 * 24 * 60 * 60_000;
export const DUREE_ADMIN_MS = 15 * 60_000;
// 2 minutes : assez précis pour l'indicateur « en ligne » du monitoring (activité < 5 min), peu d'écritures D1.
const INTERVALLE_MAJ_ACTIVITE_MS = 2 * 60_000;

export function ipClient(c: Context): string {
  return c.req.header("CF-Connecting-IP") ?? "inconnue";
}

export async function creerSession(c: Context<ContexteApi>, compteId: number): Promise<void> {
  const jeton = jetonAleatoire();
  const maintenant = Date.now();
  await c.env.BASE_DE_DONNEES.batch([
    c.env.BASE_DE_DONNEES.prepare(
      "INSERT INTO sessions (id_hash, compte_id, cree_le, expire_le, derniere_activite, ip, agent) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      await empreinteSha256(jeton),
      compteId,
      maintenant,
      maintenant + DUREE_SESSION_MS,
      maintenant,
      ipClient(c),
      (c.req.header("User-Agent") ?? "").slice(0, 200),
    ),
    c.env.BASE_DE_DONNEES.prepare("UPDATE comptes SET derniere_activite = ? WHERE id = ?").bind(maintenant, compteId),
  ]);
  setCookie(c, NOM_COOKIE, jeton, {
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Strict",
    maxAge: DUREE_SESSION_MS / 1000,
  });
}

export async function supprimerSession(c: Context<ContexteApi>): Promise<void> {
  const compte = c.get("compte");
  if (compte) {
    await c.env.BASE_DE_DONNEES.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(compte.sessionIdHash).run();
  }
  deleteCookie(c, NOM_COOKIE, { path: "/", secure: true });
}

interface LigneSession {
  id_hash: string;
  compte_id: number;
  cree_le: number;
  expire_le: number;
  derniere_activite: number;
  admin_jusqua: number;
  pseudo: string;
  role: Role;
}

/** Middleware : lit le cookie et place le compte connecté (ou null) dans le contexte. */
export const chargerSession: MiddlewareHandler<ContexteApi> = async (c, next) => {
  c.set("compte", null);
  const jeton = getCookie(c, NOM_COOKIE);
  if (!jeton || jeton.length > 100) return next();

  const base = c.env.BASE_DE_DONNEES;
  const idHash = await empreinteSha256(jeton);
  const maintenant = Date.now();
  const session = await base
    .prepare(
      `SELECT s.id_hash, s.compte_id, s.cree_le, s.expire_le, s.derniere_activite, s.admin_jusqua, c.pseudo, c.role
       FROM sessions s JOIN comptes c ON c.id = s.compte_id
       WHERE s.id_hash = ? AND c.actif = 1`,
    )
    .bind(idHash)
    .first<LigneSession>();

  if (!session || session.expire_le <= maintenant) {
    if (session) await base.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(idHash).run();
    deleteCookie(c, NOM_COOKIE, { path: "/", secure: true });
    return next();
  }

  // Prolongation glissante (au plus toutes les 2 minutes pour économiser les écritures D1).
  if (maintenant - session.derniere_activite > INTERVALLE_MAJ_ACTIVITE_MS) {
    const nouvelleExpiration = Math.min(maintenant + DUREE_SESSION_MS, session.cree_le + DUREE_MAX_SESSION_MS);
    await base.batch([
      base
        .prepare("UPDATE sessions SET derniere_activite = ?, expire_le = ? WHERE id_hash = ?")
        .bind(maintenant, nouvelleExpiration, idHash),
      base.prepare("UPDATE comptes SET derniere_activite = ? WHERE id = ?").bind(maintenant, session.compte_id),
    ]);
  }

  c.set("compte", {
    id: session.compte_id,
    pseudo: session.pseudo,
    role: session.role,
    sessionIdHash: idHash,
    adminJusqua: session.admin_jusqua,
  });
  return next();
};

/** Middleware : refuse si personne n'est connecté. */
export const exigerConnexion: MiddlewareHandler<ContexteApi> = async (c, next) => {
  if (!c.get("compte")) return c.json({ erreur: "non_connecte" }, 401);
  return next();
};

function verifierAdmin(prolonger: boolean): MiddlewareHandler<ContexteApi> {
  return async (c, next) => {
    const compte = c.get("compte");
    if (!compte) return c.json({ erreur: "non_connecte" }, 401);
    if (compte.role !== "admin") return c.json({ erreur: "interdit" }, 403);
    const maintenant = Date.now();
    if (compte.adminJusqua <= maintenant) return c.json({ erreur: "elevation_requise" }, 403);
    if (prolonger) {
      await c.env.BASE_DE_DONNEES.prepare("UPDATE sessions SET admin_jusqua = ? WHERE id_hash = ?")
        .bind(maintenant + DUREE_ADMIN_MS, compte.sessionIdHash)
        .run();
    }
    return next();
  };
}

/**
 * Middleware : refuse si le compte n'est pas admin, ou si l'accès admin n'a pas été ouvert
 * (re-saisie du mot de passe) dans les 15 dernières minutes. Prolonge l'accès à chaque requête.
 */
export const exigerAdmin = verifierAdmin(true);

/**
 * Même contrôle, SANS prolonger l'accès : pour le tableau de bord rafraîchi automatiquement.
 * Sinon une page laissée ouverte garderait l'accès admin ouvert indéfiniment (et écrirait en base à chaque fois).
 */
export const exigerAdminSansProlonger = verifierAdmin(false);
