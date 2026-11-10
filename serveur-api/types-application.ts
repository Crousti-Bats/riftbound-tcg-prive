/** Types partagés par toute l'API. */

export type Role = "joueur" | "admin";

/** Compte connecté, chargé à partir du cookie de session. */
export interface CompteConnecte {
  id: number;
  pseudo: string;
  role: Role;
  sessionIdHash: string;
  adminJusqua: number;
}

/** Contexte Hono : bindings Cloudflare + variables posées par les middlewares. */
export interface ContexteApi {
  /** Env généré par wrangler + secrets (absents des types générés). */
  Bindings: Env & { JETON_ANALYTICS_CLOUDFLARE?: string; VAPID_CLE_PUBLIQUE?: string; VAPID_CLE_PRIVEE?: string };
  Variables: { compte: CompteConnecte | null };
}
