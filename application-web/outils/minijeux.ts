/** Mini-jeux côté navigateur : types des réponses de /api/minijeux, libellés en français et compte à rebours. */
import { useEffect, useState } from "react";

/** decor : champion dont le splash art habille la tuile du mode (pure décoration, sans lien avec la réponse du jour). */
export const MODES = [
  { code: "classique", libelle: "Classique", icone: "🧩", decor: "Garen", texte: "Chaque essai te dit ce qui est juste : genre, poste, espèce, région, année…" },
  { code: "emoji", libelle: "Emoji", icone: "😀", decor: "Teemo", texte: "Devine le champion à partir d'emojis : un de plus à chaque erreur." },
  { code: "capacite", libelle: "Capacité", icone: "📜", decor: "Ryze", texte: "Retrouve le champion à partir du texte de sa Légende Riftbound." },
  { code: "illustration", libelle: "Illustration", icone: "🖼️", decor: "Lux", texte: "Le splash art officiel du champion, très zoomé, qui se dévoile à chaque erreur." },
] as const;

/** Splash art officiel (Data Dragon), pour la décoration des pages. */
export const splashDecor = (id: string) => `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg`;

const FORMAT_PARIS = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

/** Temps restant avant minuit à Paris, quand le champion du jour change. */
export function msAvantMinuitParis(maintenant = Date.now()): number {
  const parties = FORMAT_PARIS.formatToParts(new Date(maintenant));
  const valeur = (type: string) => Number(parties.find((p) => p.type === type)?.value ?? 0);
  const ecoule = (valeur("hour") * 3600 + valeur("minute") * 60 + valeur("second")) * 1000 + (maintenant % 1000);
  return Math.max(0, 86_400_000 - ecoule);
}

export const formaterChrono = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${deux(Math.floor(s / 3600))}:${deux(Math.floor((s % 3600) / 60))}:${deux(s % 60)}`;
};

/** « 05:12:33 » avant le prochain champion, mis à jour chaque seconde. */
export function useCompteARebours(): string {
  const [ms, setMs] = useState(() => msAvantMinuitParis());
  useEffect(() => {
    const minuteur = window.setInterval(() => setMs(msAvantMinuitParis()), 1000);
    return () => window.clearInterval(minuteur);
  }, []);
  return formaterChrono(ms);
}
export type Mode = (typeof MODES)[number]["code"];

export interface ChampionVue {
  id: string;
  nom: string;
  image: string;
}

export type Etat = "juste" | "partiel" | "faux";
export interface Colonne<V> {
  valeur: V;
  etat: Etat;
  sens?: "plus" | "moins" | null;
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

export interface EtatDevinette {
  jour: string;
  mode: Mode;
  essais: Array<{ champion: ChampionVue; juste: boolean; comparaison?: Comparaison }>;
  trouve: boolean;
  gain: number;
  gainPossible: number;
  trouvesAujourdhui: number;
  hier: ChampionVue | null;
  indice: { texte: string } | { emojis: string[]; total: number } | { centre: { x: number; y: number }; zoom: number } | null;
  /** carte : la Légende Riftbound montrée en indice (mode capacité) ; splash : le splash art (mode illustration). */
  reponse: (ChampionVue & { carte: { code: string; nom: string; image: string } | null; splash: string | null }) | null;
}

export interface ResumeMiniJeux {
  jour: string;
  devinette: Record<Mode, { essais: number; trouve: boolean; gain: number; gainMax: number }>;
  memory: { gainsDuJour: number; plafond: number; parties: number };
}

export interface CarteMemory {
  code: string;
  nom: string;
  image: string;
}

export interface CoupMemory {
  position: number;
  carte: CarteMemory;
  coups: number;
  premiere?: { position: number; carte: CarteMemory };
  paire?: boolean;
  terminee?: boolean;
  gain?: number;
  solde?: number;
}

/** Recherche tolérante : sans accents, sans apostrophes ni espaces (« khazix » trouve Kha'Zix). */
export const normaliser = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
