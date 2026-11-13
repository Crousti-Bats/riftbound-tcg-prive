/**
 * Règles des mini-jeux (demandé le 2026-11-13), sans accès à la base : tout se calcule à partir du catalogue.
 *
 * « Devine le champion » : chaque jour, un champion à trouver dans trois modes.
 * - classique : chaque proposition est comparée à la réponse, colonne par colonne (vert, orange, rouge, flèches) ;
 * - capacite : le texte de la Légende du champion, nom masqué ;
 * - illustration : une illustration du champion, très zoomée, qui se dézoome à chaque erreur.
 * Un champion = un nom porté par une unité « Champion » ET par au moins une Légende (56 dans les données actuelles).
 */
import { SETS_CONNUS } from "../catalogue/classification-cartes";
import type { CarteCatalogue, Catalogue } from "../catalogue/types-catalogue";

export const MODES = ["classique", "capacite", "illustration"] as const;
export type Mode = (typeof MODES)[number];

/** Régions de Runeterra présentes dans les tags des cartes. */
export const REGIONS = [
  "Bandle City",
  "Bilgewater",
  "Demacia",
  "Freljord",
  "Ionia",
  "Ixtal",
  "Mount Targon",
  "Noxus",
  "Piltover",
  "Shadow Isles",
  "Shurima",
  "The Void",
  "Zaun",
] as const;
const ENSEMBLE_REGIONS = new Set<string>(REGIONS);

export interface Champion {
  /** Identifiant du champion : cardCode de sa première Légende (ordre de sortie des sets). */
  id: string;
  nom: string;
  /** Illustration de sa première Légende (vignette de la liste). */
  image: string;
  legendes: CarteCatalogue[];
  domaines: string[];
  regions: string[];
  /** Set de sa première Légende. */
  sortie: string;
  /** Coût en énergie de sa version la moins chère. */
  energie: number | null;
  /** Might de sa version la plus forte. */
  might: number | null;
  /** Nombre de cartes à son nom (versions de base). */
  cartes: number;
  /** Cartes dont l'illustration peut servir au mode « illustration » (Légendes et unités du champion, portrait). */
  illustrations: CarteCatalogue[];
}

const ordreSet = (set: string) => SETS_CONNUS[set]?.ordre ?? 99;
const parOrdre = (a: CarteCatalogue, b: CarteCatalogue) =>
  ordreSet(a.set) - ordreSet(b.set) || a.numero.localeCompare(b.numero, "en", { numeric: true });

const cache = new WeakMap<Catalogue, Champion[]>();

/** Les champions jouables du catalogue, triés par nom (calcul mis en cache par catalogue). */
export function listerChampions(catalogue: Catalogue): Champion[] {
  const deja = cache.get(catalogue);
  if (deja) return deja;
  const cartes = catalogue.cartes;
  const unites = cartes.filter((c) => c.type === "Unit" && c.etiquettes.includes("Champion") && c.variante === "base");
  const noms = new Set(unites.map((u) => u.nom));
  const legendesParNom = new Map<string, CarteCatalogue[]>();
  for (const l of cartes.filter((c) => c.type === "Legend" && c.variante === "base").sort(parOrdre)) {
    const nom = l.tags.find((t) => noms.has(t));
    if (nom) legendesParNom.set(nom, [...(legendesParNom.get(nom) ?? []), l]);
  }
  const champions: Champion[] = [];
  for (const [nom, legendes] of legendesParNom) {
    const premiere = legendes[0];
    if (!premiere) continue;
    const sesUnites = unites.filter((u) => u.nom === nom);
    const energies = sesUnites.map((u) => u.energie).filter((n): n is number => n !== null);
    const mights = sesUnites.map((u) => u.force).filter((n): n is number => n !== null);
    const regions = [...new Set(sesUnites.flatMap((u) => u.tags.filter((t) => ENSEMBLE_REGIONS.has(t))))].sort();
    const aSonNom = cartes.filter((c) => c.tags.includes(nom));
    champions.push({
      id: premiere.code,
      nom,
      image: premiere.image,
      legendes,
      domaines: [...premiere.domaines],
      regions,
      sortie: premiere.set,
      energie: energies.length ? Math.min(...energies) : null,
      might: mights.length ? Math.max(...mights) : null,
      cartes: aSonNom.filter((c) => c.variante === "base").length,
      illustrations: aSonNom
        .filter((c) => (c.type === "Legend" || (c.type === "Unit" && c.etiquettes.includes("Champion"))) && c.orientation === "portrait")
        .sort(parOrdre),
    });
  }
  champions.sort((a, b) => a.nom.localeCompare(b.nom, "en"));
  cache.set(catalogue, champions);
  return champions;
}

/** Le champion d'une carte réponse (Légende ou carte illustrée), ou null si elle n'appartient à aucun champion. */
export function championDeLaCarte(champions: readonly Champion[], code: string): Champion | null {
  return champions.find((ch) => ch.id === code || ch.legendes.some((l) => l.code === code) || ch.illustrations.some((c) => c.code === code)) ?? null;
}

// ---------- Comparaison (mode classique) ----------

export type Etat = "juste" | "partiel" | "faux";
/** Pour un nombre ou un set : la réponse est-elle plus haut ou plus bas que la proposition ? */
export type Sens = "plus" | "moins" | null;

export interface Colonne<V> {
  valeur: V;
  etat: Etat;
  sens?: Sens;
}

export interface Comparaison {
  domaines: Colonne<string[]>;
  regions: Colonne<string[]>;
  sortie: Colonne<string>;
  energie: Colonne<number | null>;
  might: Colonne<number | null>;
  cartes: Colonne<number>;
}

export function comparerEnsembles(propose: readonly string[], reponse: readonly string[]): Etat {
  const a = new Set(propose);
  const b = new Set(reponse);
  if (a.size === b.size && [...a].every((x) => b.has(x))) return "juste";
  return [...a].some((x) => b.has(x)) ? "partiel" : "faux";
}

export function comparerNombres(propose: number | null, reponse: number | null): Colonne<number | null> {
  if (propose === reponse) return { valeur: propose, etat: "juste", sens: null };
  if (propose === null || reponse === null) return { valeur: propose, etat: "faux", sens: null };
  return { valeur: propose, etat: "faux", sens: reponse > propose ? "plus" : "moins" };
}

export function comparer(propose: Champion, reponse: Champion): Comparaison {
  const sortie = ordreSet(reponse.sortie) - ordreSet(propose.sortie);
  return {
    domaines: { valeur: propose.domaines, etat: comparerEnsembles(propose.domaines, reponse.domaines) },
    regions: { valeur: propose.regions, etat: comparerEnsembles(propose.regions, reponse.regions) },
    sortie: { valeur: propose.sortie, etat: sortie === 0 ? "juste" : "faux", sens: sortie === 0 ? null : sortie > 0 ? "plus" : "moins" },
    energie: comparerNombres(propose.energie, reponse.energie),
    might: comparerNombres(propose.might, reponse.might),
    cartes: comparerNombres(propose.cartes, reponse.cartes) as Colonne<number>,
  };
}

// ---------- Indices des modes « capacite » et « illustration » ----------

const echapper = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Texte de la Légende, avec le nom du champion et celui de la Légende masqués. */
export function texteMasque(legende: CarteCatalogue, champion: Champion): string {
  let texte = legende.texte ?? "";
  for (const nom of [champion.nom, legende.nom]) texte = texte.replace(new RegExp(echapper(nom), "gi"), "???");
  return texte;
}

/** Petit hachage déterministe (FNV-1a), pour le point de zoom du jour : aucun secret en jeu. */
function hacher(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Point de l'illustration sur lequel on zoome (en %, loin des bords), fixe pour la journée. */
export function centreDuZoom(jour: string, code: string): { x: number; y: number } {
  const h = hacher(`${jour}:${code}`);
  return { x: 25 + (h % 51), y: 20 + ((h >>> 8) % 41) };
}

/** Zoom de l'illustration : ×5 au départ, puis de moins en moins à chaque erreur, jusqu'à ×1 (image entière). */
export function zoomIllustration(erreurs: number, trouve: boolean): number {
  if (trouve) return 1;
  return Math.max(1, Math.round((5 - 0.5 * erreurs) * 10) / 10);
}

// ---------- Gains en éclats ----------

/** Gain d'un défi trouvé, selon le nombre d'essais (le 1er essai rapporte le maximum). */
export const GAINS_DEVINETTE: Record<Mode, { max: number; min: number; pas: number }> = {
  classique: { max: 30, min: 10, pas: 2 },
  capacite: { max: 15, min: 5, pas: 1 },
  illustration: { max: 15, min: 5, pas: 1 },
};

export function gainDevinette(mode: Mode, essais: number): number {
  const g = GAINS_DEVINETTE[mode];
  return Math.max(g.min, g.max - g.pas * Math.max(0, essais - 1));
}

/** Memory : 8 paires sur une grille de 4 × 4. */
export const PAIRES_MEMORY = 8;
/** Plafond des éclats gagnés au Memory par jour et par joueur. */
export const PLAFOND_MEMORY_JOUR = 30;

/** Gain d'une partie de Memory terminée, selon le nombre de coups (8 au minimum). */
export function gainMemory(coups: number): number {
  if (coups <= 12) return 10;
  if (coups <= 16) return 6;
  return 3;
}

// ---------- Jours ----------

const FORMAT_JOUR = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/** Le jour à Paris (AAAA-MM-JJ) : les défis changent à minuit, heure française. */
export function jourDeParis(maintenant: number): string {
  return FORMAT_JOUR.format(new Date(maintenant));
}

export function jourPrecedent(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
