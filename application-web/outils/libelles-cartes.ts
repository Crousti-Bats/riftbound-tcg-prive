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
  /** Champion, Signature, Token, Basic. */
  etiquettes: string[];
  domaines: string[];
  image: string;
  orientation: "portrait" | "paysage";
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

/** Carte tirée dans un booster : une carte, éventuellement foil, et le slot dont elle vient. */
export interface CarteOuverte extends Carte {
  foil: boolean;
  slot: "common" | "uncommon" | "foil" | "rarePlus" | "runeToken";
}

/** Carte possédée dans la collection : quantité normale et quantité foil. */
export interface CartePossedee extends Carte {
  quantite: number;
  quantiteFoil: number;
}

/** Les variantes « rares et plus » reçoivent un halo à l'ouverture. */
export function estRarePlus(carte: Pick<Carte, "rarete" | "variante">): boolean {
  if (["alt", "overnumbered", "signee", "special", "ultime"].includes(carte.variante)) return true;
  return carte.rarete === "Epic" || carte.rarete === "Rare";
}

/** Durée en ms → « mm:ss » (pour le minuteur du prochain booster). */
export function formaterDuree(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "0:00";
  const totalSecondes = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSecondes / 60);
  const secondes = totalSecondes % 60;
  return `${minutes}:${secondes.toString().padStart(2, "0")}`;
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

/** Types de carte : libellé français pour le filtre, nom anglais (celui des cartes) entre parenthèses. */
export const LIBELLES_TYPE: Record<string, string> = {
  Unit: "Unité (Unit)",
  Champion: "Champion",
  Signature: "Signature",
  Spell: "Sort (Spell)",
  Gear: "Équipement (Gear)",
  Legend: "Légende (Legend)",
  Battlefield: "Terrain (Battlefield)",
  Rune: "Rune",
  Token: "Token",
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
export function urlImage(image: string, largeur: 300 | 744 | 1039): string {
  return `${image}?w=${largeur}&fm=webp`;
}
