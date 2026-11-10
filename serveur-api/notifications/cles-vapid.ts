/** Clés VAPID lues dans l'environnement du Worker. null si les notifications ne sont pas configurées. */
import type { ContexteApi } from "../types-application";
import type { ClesVapid } from "./web-push";

/** Contact du serveur exigé par le protocole VAPID : l'adresse du site (aucune adresse e-mail). */
export const SUJET_VAPID = "https://riftbound-tcg.axelgirard.workers.dev";

export function clesVapid(env: ContexteApi["Bindings"]): ClesVapid | null {
  const publique = env.VAPID_CLE_PUBLIQUE;
  const privee = env.VAPID_CLE_PRIVEE;
  if (!publique || !privee) return null;
  return { publique, privee, sujet: SUJET_VAPID };
}
