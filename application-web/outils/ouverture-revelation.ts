/** Règles pures de la révélation d'un booster : catégorie de mise en scène de chaque carte, ordre de passage,
 *  thèmes musicaux. Aucune dépendance au DOM (testé dans ouverture-revelation.test.ts). */
import type { CarteOuverte } from "./libelles-cartes";

export type CategorieRevelation =
  | "common"
  | "uncommon"
  | "rune"
  | "rare"
  | "epic"
  | "alt"
  | "over"
  | "signee"
  | "special"
  | "ultime";

export interface InfoRevelation {
  nom: string;
  /** Nom court pour le grand titre (« Signée » plutôt que « Overnumbered signée »). */
  court?: string;
  /** Couleur de la lueur, de l'aura et des particules. */
  couleur: string;
  /** 0-1 : retournement simple ; 2-3 : néon puis lueur ; 4 et plus : mise en scène complète. */
  rang: number;
}

export const REVELATION: Record<CategorieRevelation, InfoRevelation> = {
  common: { nom: "Commune", couleur: "#9aa7bd", rang: 0 },
  uncommon: { nom: "Peu commune", couleur: "#4caf7a", rang: 1 },
  rune: { nom: "Rune", couleur: "#7fd6d0", rang: 1 },
  rare: { nom: "Rare", couleur: "#4a9fe0", rang: 2 },
  epic: { nom: "Epic", couleur: "#f08f2a", rang: 3 },
  alt: { nom: "Alt Art", couleur: "#c07cff", rang: 4 },
  over: { nom: "Overnumbered", couleur: "#ffd45e", rang: 5 },
  signee: { nom: "Overnumbered signée", court: "Signée", couleur: "#fff1b8", rang: 6 },
  special: { nom: "Special", couleur: "#5ff2ff", rang: 7 },
  ultime: { nom: "Ultime", couleur: "#b04dff", rang: 8 },
};

/** La variante (calculée par le serveur à partir du numéro) prime ; sinon, la rareté imprimée. */
export function categorieRevelation(carte: Pick<CarteOuverte, "rarete" | "variante">): CategorieRevelation {
  switch (carte.variante) {
    case "alt":
      return "alt";
    case "overnumbered":
      return "over";
    case "signee":
      return "signee";
    case "special":
      return "special";
    case "ultime":
      return "ultime";
    case "rune":
    case "rune_alt":
      return "rune";
  }
  switch (carte.rarete) {
    case "Uncommon":
      return "uncommon";
    case "Rare":
      return "rare";
    case "Epic":
    case "Showcase":
      return "epic";
    default:
      return "common";
  }
}

export type Theme = "kda" | "heartsteel";

export const THEMES: Record<Theme, { nom: string; couleurs: string[] }> = {
  kda: { nom: "K/DA", couleurs: ["#ff4fd8", "#b06bff", "#ffd1f4", "#ffffff"] },
  heartsteel: { nom: "HEARTSTEEL", couleurs: ["#48c8ff", "#7d5bff", "#ff5fa2", "#ffffff"] },
};

/** Cartes de Radiance aux skins musicaux : un jingle original « dans le style » accompagne leur révélation. */
const CARTES_A_THEME: Record<string, Theme> = {
  "rad-sp1-005": "kda",
  "rad-sp2-005": "kda",
  "rad-sp3-005": "kda",
  "rad-sp4-005": "kda",
  "rad-sp5-005": "kda",
  "rad-178-167": "heartsteel",
  "rad-179-167": "heartsteel",
  "rad-180-167": "heartsteel",
  "rad-181-167": "heartsteel",
  "rad-182-167": "heartsteel",
  "rad-183-167": "heartsteel",
};

export function themeCarte(code: string): Theme | null {
  return CARTES_A_THEME[code] ?? null;
}

const ORDRE_SLOTS: Record<CarteOuverte["slot"], number> = { common: 0, uncommon: 1, foil: 2, runeToken: 3, rarePlus: 4 };

/** Ordre de passage : communes, peu communes, foil, rune, puis les rares+ de la moins à la plus rare.
 *  La meilleure carte arrive toujours en dernier. Tri stable : l'ordre du serveur est gardé à égalité. */
export function ordreRevelation<T extends Pick<CarteOuverte, "slot" | "rarete" | "variante">>(cartes: T[]): T[] {
  const cle = (c: T) => ORDRE_SLOTS[c.slot] * 100 + (c.slot === "rarePlus" ? REVELATION[categorieRevelation(c)].rang : 0);
  return cartes
    .map((carte, index) => ({ carte, index }))
    .sort((a, b) => cle(a.carte) - cle(b.carte) || a.index - b.index)
    .map((x) => x.carte);
}

/** « unl-238-219 » → numéro 238 sur 219 (pour le compteur qui dépasse le total des Overnumbered). */
export function numerosCarte(code: string): { numero: number; total: number } | null {
  const m = /(\d+)\D+(\d+)$/.exec(code);
  return m ? { numero: Number(m[1]), total: Number(m[2]) } : null;
}
