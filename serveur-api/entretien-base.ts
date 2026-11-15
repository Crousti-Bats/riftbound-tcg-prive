/**
 * Ménage de la base (étape 10), sans tâche planifiée : lancé après chaque connexion réussie (quelques fois par jour).
 * Sans lui, le journal, les sessions expirées et les compteurs de limitation grossiraient sans fin.
 * Les suppressions s'appuient sur des index (ou de très petites tables) : elles ne coûtent presque rien.
 */
import { DUREE_APPAREIL_MS } from "./authentification/appareils-connus";

const JOUR_MS = 24 * 60 * 60_000;
/** Durée de conservation du journal de sécurité et d'administration. */
export const RETENTION_JOURNAL_MS = 90 * JOUR_MS;
/** Les fenêtres de limitation durent au plus 24 h : au-delà de 2 jours, une ligne ne sert plus à rien. */
const RETENTION_LIMITATIONS_MS = 2 * JOUR_MS;
/** Mini-jeux : les parties de Memory et les essais ne servent qu'au jour même (résumé, plafond, classement). */
const RETENTION_MINIJEUX_MS = 7 * JOUR_MS;

export async function purgerAnciennesDonnees(base: D1Database): Promise<void> {
  const maintenant = Date.now();
  await base.batch([
    base.prepare("DELETE FROM journal WHERE horodatage < ?").bind(maintenant - RETENTION_JOURNAL_MS),
    base.prepare("DELETE FROM sessions WHERE expire_le <= ?").bind(maintenant),
    base.prepare("DELETE FROM limitations WHERE debut_fenetre < ?").bind(maintenant - RETENTION_LIMITATIONS_MS),
    base.prepare("DELETE FROM appareils_connus WHERE dernier_usage < ?").bind(maintenant - DUREE_APPAREIL_MS),
    base.prepare("DELETE FROM parties_memory WHERE cree_le < ?").bind(maintenant - RETENTION_MINIJEUX_MS),
    // Jours au format AAAA-MM-JJ : la comparaison de textes suit l'ordre des dates.
    base.prepare("DELETE FROM devinettes WHERE jour < ?").bind(new Date(maintenant - RETENTION_MINIJEUX_MS).toISOString().slice(0, 10)),
  ]);
}
