/**
 * Quotas gratuits Cloudflare du jour, lus dans l'API GraphQL Analytics.
 * - Jeton en lecture seule (« Account Analytics: Read ») stocké en secret Worker JETON_ANALYTICS_CLOUDFLARE,
 *   jamais dans le code. Sans jeton, le tableau de bord affiche « non configuré ».
 * - Les compteurs gratuits repartent de zéro chaque jour à 00:00 UTC.
 * - Résultat gardé 60 s en mémoire : le tableau de bord se rafraîchit toutes les 8 s, inutile d'appeler l'API autant.
 */
import { z } from "zod";

export const LIMITES_GRATUITES = {
  requetesWorker: 100_000,
  lignesLuesD1: 5_000_000,
  lignesEcritesD1: 100_000,
} as const;

const URL_GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";
const DUREE_CACHE_MS = 60_000;
const DELAI_MAX_MS = 5_000;

export type EtatQuotas =
  | { statut: "non_configure" }
  | { statut: "erreur"; message: string; mesureLe: number }
  | {
      statut: "ok";
      depuis: string;
      mesureLe: number;
      requetesWorker: number;
      erreursWorker: number;
      lignesLuesD1: number;
      lignesEcritesD1: number;
      limites: typeof LIMITES_GRATUITES;
    };

const REQUETE = `query QuotasDuJour($compte: string!, $debut: Time!, $fin: Time!, $jour: Date!) {
  viewer {
    accounts(filter: { accountTag: $compte }) {
      workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $debut, datetime_leq: $fin }) {
        sum { requests errors }
      }
      d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $jour, date_leq: $jour }) {
        sum { rowsRead rowsWritten }
      }
    }
  }
}`;

const nombre = z.number().nonnegative().nullish();
const schemaReponse = z.object({
  data: z
    .object({
      viewer: z.object({
        accounts: z.array(
          z.object({
            workersInvocationsAdaptive: z.array(z.object({ sum: z.object({ requests: nombre, errors: nombre }) })).nullish(),
            d1AnalyticsAdaptiveGroups: z.array(z.object({ sum: z.object({ rowsRead: nombre, rowsWritten: nombre }) })).nullish(),
          }),
        ),
      }),
    })
    .nullish(),
  errors: z.array(z.object({ message: z.string() })).nullish(),
});

export interface ConfigQuotas {
  idCompte: string | undefined;
  jeton: string | undefined;
}

let cache: { cle: string; valeur: EtatQuotas; le: number } | null = null;

export function viderCacheQuotas(): void {
  cache = null;
}

/** Lit les quotas du jour (UTC). `telecharger` est injectable pour les tests. */
export async function lireQuotas(
  config: ConfigQuotas,
  telecharger: (url: string, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, init),
  maintenant = Date.now(),
): Promise<EtatQuotas> {
  const { idCompte, jeton } = config;
  if (!jeton || !idCompte || !/^[0-9a-f]{32}$/.test(idCompte)) return { statut: "non_configure" };

  const jour = new Date(maintenant).toISOString().slice(0, 10);
  const cle = `${idCompte}:${jour}`;
  if (cache && cache.cle === cle && maintenant - cache.le < DUREE_CACHE_MS) return cache.valeur;

  const valeur = await interroger(idCompte, jeton, jour, maintenant, telecharger);
  cache = { cle, valeur, le: maintenant };
  return valeur;
}

async function interroger(
  idCompte: string,
  jeton: string,
  jour: string,
  maintenant: number,
  telecharger: (url: string, init: RequestInit) => Promise<Response>,
): Promise<EtatQuotas> {
  const erreur = (message: string): EtatQuotas => ({ statut: "erreur", message, mesureLe: maintenant });
  try {
    const reponse = await telecharger(URL_GRAPHQL, {
      method: "POST",
      headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: REQUETE,
        variables: { compte: idCompte, debut: `${jour}T00:00:00Z`, fin: new Date(maintenant).toISOString(), jour },
      }),
      signal: AbortSignal.timeout(DELAI_MAX_MS),
    });
    if (!reponse.ok) return erreur(`API Cloudflare : HTTP ${reponse.status}`);
    const lu = schemaReponse.safeParse(await reponse.json());
    if (!lu.success) return erreur("API Cloudflare : réponse inattendue");
    if (lu.data.errors?.length) return erreur(`API Cloudflare : ${lu.data.errors[0]?.message.slice(0, 200) ?? "erreur"}`);
    const compte = lu.data.data?.viewer.accounts[0];
    if (!compte) return erreur("API Cloudflare : compte introuvable (vérifier l'ID et les droits du jeton)");

    const somme = <T>(lignes: T[] | null | undefined, valeur: (l: T) => number | null | undefined) =>
      (lignes ?? []).reduce((total, l) => total + (valeur(l) ?? 0), 0);
    return {
      statut: "ok",
      depuis: `${jour}T00:00:00Z`,
      mesureLe: maintenant,
      requetesWorker: somme(compte.workersInvocationsAdaptive, (l) => l.sum.requests),
      erreursWorker: somme(compte.workersInvocationsAdaptive, (l) => l.sum.errors),
      lignesLuesD1: somme(compte.d1AnalyticsAdaptiveGroups, (l) => l.sum.rowsRead),
      lignesEcritesD1: somme(compte.d1AnalyticsAdaptiveGroups, (l) => l.sum.rowsWritten),
      limites: LIMITES_GRATUITES,
    };
  } catch {
    // Pas de détail : le message d'une exception réseau pourrait contenir l'URL ou des en-têtes.
    return erreur("API Cloudflare injoignable");
  }
}
