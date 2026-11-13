/** Mini-jeux côté navigateur : types des réponses de /api/minijeux et libellés en français. */

export const MODES = [
  { code: "classique", libelle: "Classique", icone: "?", texte: "Chaque essai te dit ce qui est juste : domaines, région, sortie, coût…" },
  { code: "capacite", libelle: "Capacité", icone: "✎", texte: "Retrouve le champion à partir du texte de sa Légende." },
  { code: "illustration", libelle: "Illustration", icone: "◐", texte: "Une illustration très zoomée, qui se dévoile à chaque erreur." },
] as const;
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
  domaines: Colonne<string[]>;
  regions: Colonne<string[]>;
  sortie: Colonne<string>;
  energie: Colonne<number | null>;
  might: Colonne<number | null>;
  cartes: Colonne<number>;
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
  indice: { texte: string } | { centre: { x: number; y: number }; zoom: number } | null;
  reponse: (ChampionVue & { carte: { code: string; nom: string; image: string } }) | null;
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

const REGIONS: Record<string, string> = {
  "Bandle City": "Bandle",
  "Mount Targon": "Targon",
  "Shadow Isles": "Îles Obscures",
  "The Void": "Le Néant",
};
export const libelleRegion = (r: string) => REGIONS[r] ?? r;

const SETS: Record<string, string> = {
  ogn: "Origins",
  ogs: "Proving Grounds",
  sfd: "Spiritforged",
  unl: "Unleashed",
  ven: "Vendetta",
  rad: "Radiance",
};
export const libelleSet = (code: string) => SETS[code] ?? code.toUpperCase();

/** Recherche tolérante : sans accents, sans apostrophes ni espaces (« khazix » trouve Kha'Zix). */
export const normaliser = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
