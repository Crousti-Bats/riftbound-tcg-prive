/** Enregistrement des erreurs serveur (500) pour le monitoring admin. Purge automatique au-delà de 7 jours. */

export const RETENTION_ERREURS_MS = 7 * 24 * 60 * 60_000;

/**
 * On garde seulement la méthode, le chemin (sans paramètres) et un message tronqué :
 * jamais le corps de la requête ni les en-têtes (cookies de session).
 */
export async function enregistrerErreurServeur(
  base: D1Database,
  methode: string,
  chemin: string,
  erreur: unknown,
): Promise<void> {
  const maintenant = Date.now();
  const message = erreur instanceof Error ? `${erreur.name}: ${erreur.message}` : "Erreur inconnue";
  await base.batch([
    base
      .prepare("INSERT INTO erreurs_serveur (horodatage, methode, chemin, message) VALUES (?, ?, ?, ?)")
      .bind(maintenant, methode.slice(0, 10), chemin.slice(0, 200), message.slice(0, 300)),
    base.prepare("DELETE FROM erreurs_serveur WHERE horodatage < ?").bind(maintenant - RETENTION_ERREURS_MS),
  ]);
}
