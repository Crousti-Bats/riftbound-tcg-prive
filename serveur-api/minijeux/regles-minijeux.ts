/**
 * Règles des mini-jeux (demandé le 2026-11-13), sans accès à la base.
 *
 * « Devine le champion », sur le modèle des jeux « -dle » : chaque jour, un champion à trouver dans quatre modes.
 * On peut proposer n'importe lequel des champions de League of Legends (table champions-lol.ts).
 * - classique : chaque proposition est comparée à la réponse, colonne par colonne (genre, postes, espèces, ressource,
 *   portée, régions, année de sortie) : vert, orange, rouge, flèches ;
 * - emoji : des emojis qui décrivent le champion, un de plus à chaque erreur ;
 * - capacite : le texte de la Légende Riftbound du champion, nom masqué ;
 * - illustration : une illustration Riftbound du champion, très zoomée, qui se dézoome à chaque erreur.
 * Pour les deux derniers modes, la réponse est un champion qui a une Légende Riftbound (57 dans les données actuelles).
 */
import { SETS_CONNUS } from "../catalogue/classification-cartes";
import type { CarteCatalogue, Catalogue } from "../catalogue/types-catalogue";
import { type ChampionLol, championLolDuNom } from "./champions-lol";

export const MODES = ["classique", "emoji", "capacite", "illustration"] as const;
export type Mode = (typeof MODES)[number];

/** Un champion présent dans les cartes Riftbound (modes « capacite » et « illustration »). */
export interface ChampionRiftbound {
  lol: ChampionLol;
  legendes: CarteCatalogue[];
  /** Cartes dont l'illustration peut servir au mode « illustration » (Légendes et unités du champion, portrait). */
  illustrations: CarteCatalogue[];
}

const ordreSet = (set: string) => SETS_CONNUS[set]?.ordre ?? 99;
const parOrdre = (a: CarteCatalogue, b: CarteCatalogue) =>
  ordreSet(a.set) - ordreSet(b.set) || a.numero.localeCompare(b.numero, "en", { numeric: true });

const cache = new WeakMap<Catalogue, ChampionRiftbound[]>();

/** Les champions qui ont une Légende Riftbound, reliés à leur fiche LoL (calcul mis en cache par catalogue). */
export function championsRiftbound(catalogue: Catalogue): ChampionRiftbound[] {
  const deja = cache.get(catalogue);
  if (deja) return deja;
  const cartes = catalogue.cartes;
  const estUniteChampion = (c: CarteCatalogue) => c.type === "Unit" && c.etiquettes.includes("Champion");
  const noms = new Set(cartes.filter((c) => estUniteChampion(c) && c.variante === "base").map((u) => u.nom));
  const legendesParNom = new Map<string, CarteCatalogue[]>();
  for (const l of cartes.filter((c) => c.type === "Legend" && c.variante === "base").sort(parOrdre)) {
    const nom = l.tags.find((t) => noms.has(t));
    if (nom) legendesParNom.set(nom, [...(legendesParNom.get(nom) ?? []), l]);
  }
  const champions: ChampionRiftbound[] = [];
  for (const [nom, legendes] of legendesParNom) {
    const lol = championLolDuNom(nom);
    if (!lol) continue;
    const illustrations = cartes
      .filter((c) => c.tags.includes(nom) && (c.type === "Legend" || estUniteChampion(c)) && c.orientation === "portrait")
      .sort(parOrdre);
    champions.push({ lol, legendes, illustrations });
  }
  champions.sort((a, b) => a.lol.nom.localeCompare(b.lol.nom, "fr"));
  cache.set(catalogue, champions);
  return champions;
}

/** Le champion d'une carte réponse (Légende ou carte illustrée), ou null si elle n'appartient à aucun champion. */
export function championDeLaCarte(champions: readonly ChampionRiftbound[], code: string): ChampionRiftbound | null {
  return champions.find((ch) => ch.legendes.some((l) => l.code === code) || ch.illustrations.some((c) => c.code === code)) ?? null;
}

// ---------- Comparaison (mode classique) ----------

export type Etat = "juste" | "partiel" | "faux";
/** Pour l'année : la réponse est-elle plus récente ou plus ancienne que la proposition ? */
export type Sens = "plus" | "moins" | null;

export interface Colonne<V> {
  valeur: V;
  etat: Etat;
  sens?: Sens;
}

export interface Comparaison {
  genre: Colonne<string>;
  postes: Colonne<string[]>;
  especes: Colonne<string[]>;
  ressource: Colonne<string>;
  portee: Colonne<string[]>;
  regions: Colonne<string[]>;
  annee: Colonne<number>;
}

export function comparerEnsembles(propose: readonly string[], reponse: readonly string[]): Etat {
  const a = new Set(propose);
  const b = new Set(reponse);
  if (a.size === b.size && [...a].every((x) => b.has(x))) return "juste";
  return [...a].some((x) => b.has(x)) ? "partiel" : "faux";
}

const egal = <V>(propose: V, reponse: V): Colonne<V> => ({ valeur: propose, etat: propose === reponse ? "juste" : "faux" });
const ensemble = (propose: string[], reponse: string[]): Colonne<string[]> => ({ valeur: propose, etat: comparerEnsembles(propose, reponse) });

export function comparer(propose: ChampionLol, reponse: ChampionLol): Comparaison {
  return {
    genre: egal(propose.genre, reponse.genre),
    postes: ensemble(propose.postes, reponse.postes),
    especes: ensemble(propose.especes, reponse.especes),
    ressource: egal(propose.ressource, reponse.ressource),
    portee: ensemble(propose.portee, reponse.portee),
    regions: ensemble(propose.regions, reponse.regions),
    annee: {
      valeur: propose.annee,
      etat: propose.annee === reponse.annee ? "juste" : "faux",
      sens: propose.annee === reponse.annee ? null : reponse.annee > propose.annee ? "plus" : "moins",
    },
  };
}

/** Mode emoji : 1 emoji au départ, 1 de plus à chaque erreur ; tous une fois le champion trouvé. */
export function emojisVisibles(champion: ChampionLol, erreurs: number, trouve: boolean): string[] {
  return trouve ? champion.emojis : champion.emojis.slice(0, Math.min(champion.emojis.length, 1 + erreurs));
}

// ---------- Indices des modes « capacite » et « illustration » ----------

const echapper = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Texte de la Légende, avec le nom du champion et celui de la Légende masqués. */
export function texteMasque(legende: CarteCatalogue, champion: ChampionRiftbound): string {
  let texte = legende.texte ?? "";
  const nomsDuChampion = legende.tags.filter((t) => championLolDuNom(t)?.id === champion.lol.id);
  for (const nom of [...nomsDuChampion, champion.lol.nom, legende.nom]) texte = texte.replace(new RegExp(echapper(nom), "gi"), "???");
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
  emoji: { max: 15, min: 5, pas: 1 },
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
