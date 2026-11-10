/**
 * Transforme les données brutes de la source en catalogue propre :
 * validation stricte de chaque carte (la source est externe, on ne lui fait pas confiance),
 * classification en variante, statistiques par set.
 */
import { z } from "zod";
import type { Catalogue, CarteCatalogue, Rarete, SetCatalogue, Variante } from "./types-catalogue";
import { RARETES } from "./types-catalogue";

/** Sets connus, dans l'ordre de sortie. Un set inconnu apparaîtra à la fin, non ouvrable par défaut. */
export const SETS_CONNUS: Record<string, { ordre: number; ouvrable: boolean }> = {
  ogn: { ordre: 1, ouvrable: true }, // Origins
  ogs: { ordre: 2, ouvrable: false }, // Proving Grounds (produit starter, pas de booster)
  sfd: { ordre: 3, ouvrable: true }, // Spiritforged
  unl: { ordre: 4, ouvrable: true }, // Unleashed
  ven: { ordre: 5, ouvrable: true }, // Vendetta
  rad: { ordre: 6, ouvrable: true }, // Radiance
};

/** Seules les images du CDN officiel Riot sont acceptées (aussi autorisé par la CSP). */
export const PREFIXE_IMAGES = "https://cmsassets.rgpub.io/";

const texteCourt = (max: number) => z.string().max(max);
const nombreOuNul = z.number().int().min(0).max(99).nullish();

const schemaCarteSource = z.object({
  cardCode: z.string().regex(/^[a-z0-9-]{3,40}$/),
  name: texteCourt(100),
  subtitle: texteCourt(100).nullish(),
  setCode: z.string().regex(/^[a-z]{2,5}$/),
  cardSet: texteCourt(60),
  cardNumber: z.string().regex(/^[a-z0-9-]{1,20}$/),
  rarity: z.enum(RARETES),
  cardType: texteCourt(40),
  cardTypeLabels: z.array(texteCourt(30)).max(6).nullish(),
  domains: z.array(texteCourt(30)).max(6).nullish(),
  tags: z.array(texteCourt(40)).max(10).nullish(),
  imageUrl: z.string().max(300).startsWith(PREFIXE_IMAGES),
  energy: nombreOuNul,
  power: nombreOuNul,
  might: nombreOuNul,
  abilityEffective: texteCourt(2000).nullish(),
  artist: texteCourt(100).nullish(),
  scrapedAt: texteCourt(40).nullish(),
});

/**
 * Cartes rangées à la main dans les Special Alt (décision de l'utilisateur le 2026-11-10) : la source les numérote
 * comme des Overnumbered (numéro au-delà du total du set), mais ce sont des Special. Clé : set, puis numéro.
 * Radiance 177 à 183/167 : Ekko Revolutionary, K'Sante Courageous, Aphelios Exalted, Ezreal Dashing,
 * Yone Blademaster, Kayn Unleashed, Sett Kingpin.
 */
export const SPECIAUX_FORCES: Readonly<Record<string, ReadonlySet<string>>> = {
  rad: new Set(["177-167", "178-167", "179-167", "180-167", "181-167", "182-167", "183-167"]),
};

export function classerVariante(numero: string, rarete: Rarete, set?: string): Variante | null {
  if (set && SPECIAUX_FORCES[set]?.has(numero)) return "special";
  if (/^\d+-star-\d+$/.test(numero)) return "signee";
  const m = /^(\d+)(a?)-(\d+)$/.exec(numero);
  if (m) {
    if (m[2]) return "alt";
    if (Number(m[1]) > Number(m[3])) return rarete === "Epic" ? "ultime" : "overnumbered";
    return "base";
  }
  if (/^sp\d+-\d+$/.test(numero)) return "special";
  if (/^r\d+a$/.test(numero)) return "rune_alt";
  if (/^r\d+$/.test(numero)) return "rune";
  if (/^t\d+$/.test(numero)) return "token";
  return null;
}

/** L'URL d'image contient ses dimensions (ex. "...-1039x744.png") : plus large que haute = paysage. */
export function orientationImage(url: string): "portrait" | "paysage" {
  const m = /-(\d+)x(\d+)\.\w+$/.exec(url);
  return m && Number(m[1]) > Number(m[2]) ? "paysage" : "portrait";
}

/** Filtre « type » : le type principal (Unit, Battlefield…) OU une étiquette (Champion, Signature, Token).
 *  Ainsi « Champion » donne les unités et légendes champions, « Token » tous les tokens. Insensible à la casse. */
export function correspondAuType(carte: Pick<CarteCatalogue, "type" | "etiquettes">, type: string): boolean {
  const t = type.toLowerCase();
  return carte.type.toLowerCase() === t || carte.etiquettes.some((e) => e.toLowerCase() === t);
}

export function construireCatalogue(brut: unknown): Catalogue {
  const liste = Array.isArray(brut) ? brut : [];
  const cartes: CarteCatalogue[] = [];
  const nomsSets = new Map<string, string>();
  let ignorees = 0;
  let miseAJourSource: string | null = null;

  for (const element of liste) {
    const r = schemaCarteSource.safeParse(element);
    if (!r.success) {
      ignorees++;
      continue;
    }
    const c = r.data;
    const variante = classerVariante(c.cardNumber, c.rarity, c.setCode);
    if (!variante) {
      ignorees++;
      continue;
    }
    nomsSets.set(c.setCode, c.cardSet);
    if (c.scrapedAt && (!miseAJourSource || c.scrapedAt > miseAJourSource)) miseAJourSource = c.scrapedAt;
    cartes.push({
      code: c.cardCode,
      nom: c.name,
      sousTitre: c.subtitle ?? null,
      set: c.setCode,
      numero: c.cardNumber,
      rarete: c.rarity,
      variante,
      type: c.cardType,
      etiquettes: (c.cardTypeLabels ?? []).filter((e) => e !== c.cardType),
      tags: c.tags ?? [],
      domaines: c.domains ?? [],
      image: c.imageUrl,
      orientation: orientationImage(c.imageUrl),
      energie: c.energy ?? null,
      puissance: c.power ?? null,
      force: c.might ?? null,
      texte: c.abilityEffective ?? null,
      artiste: c.artist ?? null,
    });
  }

  const ordre = (set: string) => SETS_CONNUS[set]?.ordre ?? 99;
  cartes.sort((a, b) => ordre(a.set) - ordre(b.set) || a.numero.localeCompare(b.numero, "en", { numeric: true }));

  const sets: SetCatalogue[] = [...nomsSets.entries()]
    .sort(([a], [b]) => ordre(a) - ordre(b))
    .map(([code, nom]) => {
      const duSet = cartes.filter((c) => c.set === code);
      const parVariante: SetCatalogue["parVariante"] = {};
      const parRarete: SetCatalogue["parRarete"] = {};
      for (const c of duSet) {
        parVariante[c.variante] = (parVariante[c.variante] ?? 0) + 1;
        parRarete[c.rarete] = (parRarete[c.rarete] ?? 0) + 1;
      }
      return { code, nom, ouvrable: SETS_CONNUS[code]?.ouvrable ?? false, nbCartes: duSet.length, parVariante, parRarete };
    });

  return { cartes, sets, miseAJourSource, chargeLe: Date.now(), cartesIgnorees: ignorees };
}

/** Tri par rareté proposé par le catalogue et les collections (sinon : ordre du catalogue, par set et numéro). */
export const TRIS = ["rarete-desc", "rarete-asc"] as const;
export type Tri = (typeof TRIS)[number];

const RANG_VARIANTE: Partial<Record<string, number>> = { ultime: 9, special: 8, signee: 7, overnumbered: 6, alt: 5 };
const RANG_RARETE: Partial<Record<string, number>> = { Epic: 4, Showcase: 4, Rare: 3, Uncommon: 2, Common: 1 };

/** Rang de rareté d'une carte : la variante prime (Ultime > Special > Signée > Overnumbered > Alt Art), puis la
 *  rareté imprimée (Epic > Rare > Uncommon > Common). Runes et tokens en dernier. */
export function rangRarete(carte: Pick<CarteCatalogue, "rarete" | "variante" | "type">): number {
  const variante = RANG_VARIANTE[carte.variante];
  if (variante !== undefined) return variante;
  if (carte.variante === "rune_alt") return 0.5;
  if (carte.variante === "token" || carte.variante === "rune" || carte.type.toLowerCase() === "rune") return 0;
  return RANG_RARETE[carte.rarete] ?? 0;
}

/** Trie sans perdre l'ordre du catalogue entre cartes de même rareté (tri stable). */
export function trierParRarete<T extends Pick<CarteCatalogue, "rarete" | "variante" | "type">>(cartes: T[], tri: Tri | undefined): T[] {
  if (!tri) return cartes;
  const sens = tri === "rarete-desc" ? -1 : 1;
  return [...cartes].sort((a, b) => sens * (rangRarete(a) - rangRarete(b)));
}
