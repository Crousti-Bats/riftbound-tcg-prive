/**
 * Tâche planifiée (toutes les 5 minutes, voir « triggers » dans cloudflare-wrangler.jsonc) :
 * prévient par notification push les joueurs dont le stock vient d'atteindre le maximum (STOCK_MAX).
 *
 * Le stock est calculé « paresseusement » (aucune écriture quand il remonte) : on calcule donc l'instant
 * où il atteint le maximum = boosters_tick + (STOCK_MAX − stock_boosters) × INTERVALLE_REGEN_MS. Cet instant est mémorisé dans
 * boosters_plein_notifie : une seule notification par remplissage. Ouvrir un booster change l'instant,
 * donc le remplissage suivant sera notifié à son tour. Un compte resté au maximum sans rien ouvrir n'est pas notifié.
 */
import { INTERVALLE_REGEN_MS, STOCK_MAX } from "../boosters/configuration-taux";
import type { ClesVapid } from "./web-push";
import { envoyerNotification } from "./web-push";

export const MESSAGE_BOOSTERS_PLEINS = {
  titre: "Tes boosters sont pleins !",
  texte: `Tu as ${STOCK_MAX} boosters sur ${STOCK_MAX}. Ouvre-les pour ne pas en perdre.`,
  url: "/",
};

interface CompteAPrevenir {
  id: number;
  stock_boosters: number;
  boosters_tick: number;
  plein_le: number;
}

export async function prevenirBoostersPleins(
  base: D1Database,
  cles: ClesVapid,
  telecharger: typeof fetch = fetch,
): Promise<{ comptes: number; envoyes: number }> {
  const maintenant = Date.now();
  const { results: comptes } = await base
    .prepare(
      `SELECT c.id, c.stock_boosters, c.boosters_tick,
              c.boosters_tick + (? - c.stock_boosters) * ? AS plein_le
       FROM comptes c
       WHERE c.actif = 1 AND c.stock_boosters < ?
         AND c.boosters_tick + (? - c.stock_boosters) * ? <= ?
         AND (c.boosters_plein_notifie IS NULL OR c.boosters_plein_notifie <> c.boosters_tick + (? - c.stock_boosters) * ?)
         AND EXISTS (SELECT 1 FROM abonnements_push a WHERE a.compte_id = c.id)
       LIMIT 200`,
    )
    .bind(STOCK_MAX, INTERVALLE_REGEN_MS, STOCK_MAX, STOCK_MAX, INTERVALLE_REGEN_MS, maintenant, STOCK_MAX, INTERVALLE_REGEN_MS)
    .all<CompteAPrevenir>();

  let envoyes = 0;
  let prevenus = 0;
  for (const compte of comptes) {
    // On marque AVANT d'envoyer, et seulement si le stock n'a pas bougé entre-temps (pas de double envoi
    // si deux exécutions se chevauchent).
    const marque = await base
      .prepare(
        "UPDATE comptes SET boosters_plein_notifie = ? WHERE id = ? AND stock_boosters = ? AND boosters_tick = ?",
      )
      .bind(compte.plein_le, compte.id, compte.stock_boosters, compte.boosters_tick)
      .run();
    if (marque.meta.changes !== 1) continue;
    prevenus++;

    const { results: abonnements } = await base
      .prepare("SELECT endpoint, p256dh, auth FROM abonnements_push WHERE compte_id = ?")
      .bind(compte.id)
      .all<{ endpoint: string; p256dh: string; auth: string }>();
    for (const abonnement of abonnements) {
      const resultat = await envoyerNotification(abonnement, MESSAGE_BOOSTERS_PLEINS, cles, telecharger);
      if (resultat === "envoye") envoyes++;
      if (resultat === "abonnement_perime") {
        await base.prepare("DELETE FROM abonnements_push WHERE endpoint = ?").bind(abonnement.endpoint).run();
      }
    }
  }
  return { comptes: prevenus, envoyes };
}
