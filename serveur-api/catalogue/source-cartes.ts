/**
 * Récupération du catalogue depuis la source publique LouisCourrian/riftbound-cards.
 * Rien n'est stocké en base. Trois niveaux de cache :
 *   1. mémoire du Worker (tant que l'instance vit) ;
 *   2. Cache API Cloudflare (catalogue déjà transformé, 24 h) ;
 *   3. téléchargement de la source (1,5 Mo) puis transformation.
 * En cas de panne de la source, on continue de servir l'ancienne version en mémoire.
 */
import { construireCatalogue } from "./classification-cartes";
import type { Catalogue } from "./types-catalogue";

/**
 * Sources, essayées dans l'ordre. Même fichier, même auteur.
 * Mesuré depuis le réseau Cloudflare le 2026-11-08 : Hugging Face environ 0,16 s, GitHub de 3 à 9,5 s (trop lent seul).
 */
export const URLS_SOURCE = [
  "https://huggingface.co/datasets/Wysme/riftbound-cards/resolve/main/cards.json",
  "https://github.com/LouisCourrian/riftbound-cards/releases/latest/download/cards.json",
] as const;
export const URL_SOURCE = URLS_SOURCE[0];
const DELAI_MAX_SOURCE_MS = 8_000;
// Changer la version dès que le format de Catalogue change, sinon l'ancien format reste servi pendant 24 h.
const CLE_CACHE = "https://cache.riftbound-tcg.interne/catalogue-v2.json";
export const DUREE_CACHE_MS = 24 * 60 * 60_000;

export interface DependancesSource {
  telecharger: (url: string) => Promise<Response>;
  cache: Cache | null;
  /** Permet au Worker de finir d'écrire le cache après avoir répondu. */
  enArrierePlan?: (promesse: Promise<unknown>) => void;
}

let enMemoire: Catalogue | null = null;
let chargementEnCours: Promise<Catalogue> | null = null;

export function viderCacheMemoire(): void {
  enMemoire = null;
  chargementEnCours = null;
}

/** Pour les tests : injecte un catalogue en mémoire (évite tout appel réseau). */
export function amorcerCataloguePourTest(catalogue: Catalogue): void {
  enMemoire = catalogue;
  chargementEnCours = null;
}

function dependancesParDefaut(): DependancesSource {
  const global = globalThis as unknown as { caches?: { default?: Cache } };
  return {
    telecharger: (url) => fetch(url, { signal: AbortSignal.timeout(DELAI_MAX_SOURCE_MS), headers: { "User-Agent": "riftbound-tcg-prive" } }),
    cache: global.caches?.default ?? null,
  };
}

async function lireCacheCloudflare(cache: Cache | null): Promise<Catalogue | null> {
  if (!cache) return null;
  const reponse = await cache.match(CLE_CACHE);
  if (!reponse) return null;
  const catalogue = (await reponse.json()) as Catalogue;
  return Date.now() - catalogue.chargeLe < DUREE_CACHE_MS ? catalogue : null;
}

async function telechargerUneSource(dep: DependancesSource, url: string): Promise<Catalogue> {
  const reponse = await dep.telecharger(url);
  if (!reponse.ok) throw new Error(`source des cartes indisponible (HTTP ${reponse.status}) : ${url}`);
  const catalogue = construireCatalogue(await reponse.json());
  if (catalogue.cartes.length === 0) throw new Error(`source des cartes vide ou illisible : ${url}`);
  return catalogue;
}

async function telechargerSource(dep: DependancesSource): Promise<Catalogue> {
  let catalogue: Catalogue | null = null;
  let derniereErreur: unknown = null;
  for (const url of URLS_SOURCE) {
    try {
      catalogue = await telechargerUneSource(dep, url);
      break;
    } catch (err) {
      console.warn("catalogue : échec de la source, on essaie la suivante", url, err);
      derniereErreur = err;
    }
  }
  if (!catalogue) throw derniereErreur instanceof Error ? derniereErreur : new Error("source des cartes indisponible");
  if (catalogue.cartesIgnorees > 0) console.warn(`catalogue : ${catalogue.cartesIgnorees} carte(s) ignorée(s) (format inattendu)`);

  if (dep.cache) {
    const ecriture = dep.cache.put(
      CLE_CACHE,
      new Response(JSON.stringify(catalogue), {
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${DUREE_CACHE_MS / 1000}` },
      }),
    );
    if (dep.enArrierePlan) dep.enArrierePlan(ecriture);
    else await ecriture;
  }
  return catalogue;
}

export async function obtenirCatalogue(dep: DependancesSource = dependancesParDefaut()): Promise<Catalogue> {
  if (enMemoire && Date.now() - enMemoire.chargeLe < DUREE_CACHE_MS) return enMemoire;
  if (chargementEnCours) return chargementEnCours;

  chargementEnCours = (async () => {
    try {
      const catalogue = (await lireCacheCloudflare(dep.cache).catch(() => null)) ?? (await telechargerSource(dep));
      enMemoire = catalogue;
      return catalogue;
    } catch (err) {
      if (enMemoire) {
        console.error("catalogue : source en panne, on garde l'ancienne version", err);
        return enMemoire;
      }
      throw err;
    } finally {
      chargementEnCours = null;
    }
  })();
  return chargementEnCours;
}
