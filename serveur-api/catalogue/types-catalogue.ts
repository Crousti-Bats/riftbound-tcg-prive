/** Types du catalogue de cartes (données issues de LouisCourrian/riftbound-cards, jamais stockées en base). */

export const RARETES = ["Common", "Uncommon", "Rare", "Epic", "Showcase"] as const;
export type Rarete = (typeof RARETES)[number];

/**
 * Variante d'impression, déduite du numéro de carte :
 * - base         NNN-TTT (NNN ≤ TTT)     carte normale, avec sa rareté
 * - alt          NNNa-TTT                Alt Art
 * - overnumbered NNN-TTT  (NNN > TTT)    Overnumbered
 * - signee       NNN-star-TTT            Overnumbered signée
 * - special      spX-NNN                 Special Alt
 * - ultime       overnumbered de rareté Epic (ex. Baron Nashor UNL-238)
 * - rune / rune_alt / token              slot Rune/Token
 */
export const VARIANTES = ["base", "alt", "overnumbered", "signee", "special", "ultime", "rune", "rune_alt", "token"] as const;
export type Variante = (typeof VARIANTES)[number];

export interface CarteCatalogue {
  code: string;
  nom: string;
  sousTitre: string | null;
  set: string;
  numero: string;
  rarete: Rarete;
  variante: Variante;
  type: string;
  /** Étiquettes secondaires de la source (cardTypeLabels sans le type) : Champion, Signature, Token, Basic. */
  etiquettes: string[];
  /** Tags de la source : nom du champion (Légendes, Champions, Signatures), région… Servent aux règles de deck. */
  tags: string[];
  domaines: string[];
  image: string;
  /** Les Battlefields sont des images horizontales (1039×744). */
  orientation: "portrait" | "paysage";
  energie: number | null;
  puissance: number | null;
  force: number | null;
  texte: string | null;
  artiste: string | null;
}

export interface SetCatalogue {
  code: string;
  nom: string;
  /** Peut-on ouvrir des boosters de ce set ? (Proving Grounds est un produit starter) */
  ouvrable: boolean;
  nbCartes: number;
  parVariante: Partial<Record<Variante, number>>;
  parRarete: Partial<Record<Rarete, number>>;
}

export interface Catalogue {
  cartes: CarteCatalogue[];
  sets: SetCatalogue[];
  /** Date de la donnée la plus récente de la source (scrapedAt). */
  miseAJourSource: string | null;
  chargeLe: number;
  cartesIgnorees: number;
}
