/**
 * Appareils connus (étape 10) : protège le propriétaire d'un compte contre le blocage volontaire.
 *
 * Problème : après 5 mauvais mots de passe sur un pseudo, la connexion à ce pseudo est bloquée 15 minutes.
 * N'importe qui connaissant le pseudo pouvait donc bloquer son propriétaire indéfiniment.
 *
 * Solution (« device cookie », recommandée par l'OWASP) : après une connexion réussie, le navigateur reçoit
 * un jeton aléatoire dans le cookie __Host-appareil (HttpOnly, Secure, SameSite=Strict, 1 an).
 * Sur cet appareil, les tentatives sont comptées à part (5 échecs / 15 min, par appareil) : l'attaquant
 * remplit le compteur du pseudo, mais pas celui des appareils du propriétaire.
 * Ce jeton n'ouvre AUCUNE session : il faut toujours le bon mot de passe.
 */
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { empreinteSha256, jetonAleatoire } from "../securite/jetons-et-empreintes";
import type { ContexteApi } from "../types-application";

export const NOM_COOKIE_APPAREIL = "__Host-appareil";
export const DUREE_APPAREIL_MS = 365 * 24 * 60 * 60_000;

/** Empreinte du cookie appareil s'il est présent et appartient bien à ce compte, sinon null. */
export async function appareilConnuDuCompte(c: Context<ContexteApi>, compteId: number): Promise<string | null> {
  const jeton = getCookie(c, NOM_COOKIE_APPAREIL);
  if (!jeton || jeton.length > 100) return null;
  const jetonHash = await empreinteSha256(jeton);
  const ligne = await c.env.BASE_DE_DONNEES.prepare(
    "SELECT 1 AS present FROM appareils_connus WHERE jeton_hash = ? AND compte_id = ? AND dernier_usage > ?",
  )
    .bind(jetonHash, compteId, Date.now() - DUREE_APPAREIL_MS)
    .first();
  return ligne ? jetonHash : null;
}

/** Après une connexion réussie : confirme l'appareil (s'il est déjà connu) ou en enregistre un nouveau. */
export async function memoriserAppareil(c: Context<ContexteApi>, compteId: number, jetonHashConnu: string | null): Promise<void> {
  const base = c.env.BASE_DE_DONNEES;
  const maintenant = Date.now();
  if (jetonHashConnu) {
    await base.prepare("UPDATE appareils_connus SET dernier_usage = ? WHERE jeton_hash = ?").bind(maintenant, jetonHashConnu).run();
    return;
  }
  const jeton = jetonAleatoire();
  await base
    .prepare("INSERT INTO appareils_connus (jeton_hash, compte_id, cree_le, dernier_usage) VALUES (?, ?, ?, ?)")
    .bind(await empreinteSha256(jeton), compteId, maintenant, maintenant)
    .run();
  setCookie(c, NOM_COOKIE_APPAREIL, jeton, {
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Strict",
    maxAge: DUREE_APPAREIL_MS / 1000,
  });
}
