/** Libellés français et outils d'affichage des cartes. */

export interface Carte {
  code: string;
  nom: string;
  sousTitre: string | null;
  set: string;
  numero: string;
  rarete: string;
  variante: string;
  type: string;
  domaines: string[];
  image: string;
  energie: number | null;
  puissance: number | null;
  force: number | null;
  texte: string | null;
  artiste: string | null;
}

export interface SetInfo {
  code: string;
  nom: string;
  ouvrable: boolean;
  nbCartes: number;
}

export const LIBELLES_RARETE: Record<string, string> = {
  Common: "Commune",
  Uncommon: "Peu commune",
  Rare: "Rare",
  Epic: "Épique",
  Showcase: "Showcase",
};

export const LIBELLES_VARIANTE: Record<string, string> = {
  base: "Normale",
  alt: "Alt Art",
  overnumbered: "Overnumbered",
  signee: "Overnumbered signée",
  special: "Special Alt",
  ultime: "Ultime",
  rune: "Rune",
  rune_alt: "Rune alt",
  token: "Token",
};

/** Classe CSS de couleur selon la rareté / variante (pour le liseré des cartes). */
export function classeRarete(carte: Pick<Carte, "rarete" | "variante">): string {
  if (carte.variante === "ultime") return "rarete-ultime";
  if (carte.variante === "signee") return "rarete-signee";
  if (carte.variante === "overnumbered" || carte.variante === "special") return "rarete-over";
  if (carte.variante === "alt" || carte.variante === "rune_alt") return "rarete-alt";
  return `rarete-${carte.rarete.toLowerCase()}`;
}

/** Le CDN Riot redimensionne et convertit en WebP : 28 Ko au lieu de 1,2 Mo pour une miniature. */
export function urlImage(image: string, largeur: 300 | 744): string {
  return `${image}?w=${largeur}&fm=webp`;
}
