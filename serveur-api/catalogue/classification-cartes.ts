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
  domains: z.array(texteCourt(30)).max(6).nullish(),
  imageUrl: z.string().max(300).startsWith(PREFIXE_IMAGES),
  energy: nombreOuNul,
  power: nombreOuNul,
  might: nombreOuNul,
  abilityEffective: texteCourt(2000).nullish(),
  artist: texteCourt(100).nullish(),
  scrapedAt: texteCourt(40).nullish(),
});

export function classerVariante(numero: string, rarete: Rarete): Variante | null {
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
    const variante = classerVariante(c.cardNumber, c.rarity);
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
