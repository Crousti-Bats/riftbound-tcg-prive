/**
 * Règles de construction d'un deck Riftbound (Core Rules 103.x) et export texte. Fonctions pures, sans base ni réseau.
 *
 * Un deck : 1 Légende, 1 Champion choisi (unité Champion dont le nom est un tag de la Légende), un deck principal
 * d'au moins 40 cartes (champion compris), 3 exemplaires au plus d'un même nom (champion compris), 3 cartes
 * Signature au plus (de la Légende), 12 runes, 3 champs de bataille de noms différents. Toutes les cartes (sauf
 * les champs de bataille et les cartes sans domaine) doivent être dans les domaines de la Légende.
 * Sur ce site, on ne peut jouer que les cartes que l'on possède : chaque code est limité à sa quantité possédée.
 */
import type { CarteCatalogue } from "../catalogue/types-catalogue";

export const TAILLE_PRINCIPAL = 40;
export const NOMBRE_RUNES = 12;
export const NOMBRE_TERRAINS = 3;
export const MAX_EXEMPLAIRES = 3;
export const MAX_SIGNATURES = 3;

export interface LigneDeck {
  code: string;
  n: number;
}

export interface ContenuDeck {
  legende: string | null;
  champion: string | null;
  principal: LigneDeck[];
  runes: LigneDeck[];
  terrains: string[];
}

export const DECK_VIDE: ContenuDeck = { legende: null, champion: null, principal: [], runes: [], terrains: [] };

export interface ValidationDeck {
  valide: boolean;
  erreurs: string[];
  compteurs: { principal: number; runes: number; terrains: number };
}

type Carte = Pick<CarteCatalogue, "code" | "nom" | "sousTitre" | "type" | "etiquettes" | "tags" | "domaines" | "variante">;

/** « Ahri, Confident » : le nom qui compte pour la limite d'exemplaires (les variantes d'une carte partagent ce nom). */
export function nomComplet(carte: Pick<Carte, "nom" | "sousTitre">): string {
  return carte.sousTitre ? `${carte.nom}, ${carte.sousTitre}` : carte.nom;
}

const domainesDe = (carte: Carte) => carte.domaines.filter((d) => d !== "Colorless");
const estChampion = (carte: Carte) => carte.type === "Unit" && carte.etiquettes.includes("Champion");
const estSignature = (carte: Carte) => carte.etiquettes.includes("Signature");
export const estToken = (carte: Carte) => carte.variante === "token" || carte.type === "Token" || carte.etiquettes.includes("Token");

/** Noms de tous les champions du catalogue (pour retrouver le champion d'une Légende parmi ses tags). */
export function nomsDesChampions(cartes: Iterable<Carte>): Set<string> {
  const noms = new Set<string>();
  for (const carte of cartes) if (estChampion(carte)) noms.add(carte.nom);
  return noms;
}

/** Champion(s) d'une Légende : ses tags qui sont des noms de champion (« Ziggs » oui, « Yordle » non). */
export function championsDeLaLegende(legende: Carte, champions: Set<string>): string[] {
  return (legende.tags ?? []).filter((t) => champions.has(t));
}

/** Nom d'une Légende tel que les sites de jeu l'attendent : « Ekko, Boy Who Shattered Time ». */
export function nomLegende(legende: Carte, champions: Set<string>): string {
  const champion = championsDeLaLegende(legende, champions)[0];
  return champion && !legende.nom.startsWith(`${champion},`) ? `${champion}, ${nomComplet(legende)}` : nomComplet(legende);
}

export function validerDeck(
  deck: ContenuDeck,
  parCode: ReadonlyMap<string, Carte>,
  champions: Set<string>,
  possession: ReadonlyMap<string, number>,
): ValidationDeck {
  const erreurs: string[] = [];
  const carte = (code: string | null) => (code ? parCode.get(code) : undefined);
  const legende = carte(deck.legende);
  const champion = carte(deck.champion);
  const somme = (lignes: LigneDeck[]) => lignes.reduce((t, l) => t + l.n, 0);
  const compteurs = {
    principal: somme(deck.principal) + (deck.champion ? 1 : 0),
    runes: somme(deck.runes),
    terrains: deck.terrains.length,
  };

  // Légende et champion choisi.
  const championsLegende = legende ? championsDeLaLegende(legende, champions) : [];
  if (!legende) erreurs.push("Choisis une Légende.");
  else if (legende.type !== "Legend") erreurs.push(`${nomComplet(legende)} n'est pas une Légende.`);
  if (!champion) erreurs.push("Choisis ton champion (une unité Champion de ta Légende).");
  else if (!estChampion(champion)) erreurs.push(`${nomComplet(champion)} n'est pas une unité Champion.`);
  else if (legende && !championsLegende.includes(champion.nom)) {
    erreurs.push(`Le champion doit être ${championsLegende.join(" ou ") || "celui de ta Légende"} (pas ${champion.nom}).`);
  }

  // Domaines : tout doit être dans les domaines de la Légende (cartes sans domaine acceptées).
  const domaines = new Set(legende ? domainesDe(legende) : []);
  const horsDomaine = new Set<string>();
  const verifierDomaine = (c: Carte | undefined) => {
    if (legende && c && !domainesDe(c).every((d) => domaines.has(d))) horsDomaine.add(nomComplet(c));
  };

  // Deck principal.
  const parNom = new Map<string, number>();
  if (champion) parNom.set(nomComplet(champion), 1);
  verifierDomaine(champion);
  let signatures = 0;
  const interdites = new Set<string>();
  const signaturesAutres = new Set<string>();
  for (const ligne of deck.principal) {
    const c = carte(ligne.code);
    if (!c) continue;
    if (c.type === "Legend" || c.type === "Battlefield" || c.type === "Rune" || estToken(c)) {
      interdites.add(nomComplet(c));
      continue;
    }
    parNom.set(nomComplet(c), (parNom.get(nomComplet(c)) ?? 0) + ligne.n);
    verifierDomaine(c);
    if (estSignature(c)) {
      signatures += ligne.n;
      if (legende && !(c.tags ?? []).some((t) => championsLegende.includes(t))) signaturesAutres.add(nomComplet(c));
    }
  }
  if (compteurs.principal < TAILLE_PRINCIPAL) {
    erreurs.push(`Deck principal : ${compteurs.principal}/${TAILLE_PRINCIPAL} cartes (champion compris).`);
  }
  for (const nom of interdites) erreurs.push(`${nom} ne va pas dans le deck principal.`);
  for (const [nom, n] of parNom) {
    if (n > MAX_EXEMPLAIRES) erreurs.push(`${n} × ${nom} : ${MAX_EXEMPLAIRES} exemplaires au maximum (champion compris).`);
  }
  if (signatures > MAX_SIGNATURES) erreurs.push(`${signatures} cartes Signature : ${MAX_SIGNATURES} au maximum.`);
  for (const nom of signaturesAutres) erreurs.push(`${nom} est une carte Signature d'un autre champion.`);

  // Runes.
  for (const ligne of deck.runes) {
    const c = carte(ligne.code);
    if (c && c.type !== "Rune") erreurs.push(`${nomComplet(c)} n'est pas une rune.`);
    verifierDomaine(c);
  }
  if (compteurs.runes !== NOMBRE_RUNES) erreurs.push(`Runes : ${compteurs.runes}/${NOMBRE_RUNES}.`);

  // Champs de bataille : 3, de noms différents, sans contrainte de domaine.
  const nomsTerrains = new Set<string>();
  for (const code of deck.terrains) {
    const c = carte(code);
    if (!c) continue;
    if (c.type !== "Battlefield") erreurs.push(`${nomComplet(c)} n'est pas un champ de bataille.`);
    else if (nomsTerrains.has(nomComplet(c))) erreurs.push(`${nomComplet(c)} est en double : 3 champs de bataille différents.`);
    nomsTerrains.add(nomComplet(c));
  }
  if (compteurs.terrains !== NOMBRE_TERRAINS) erreurs.push(`Champs de bataille : ${compteurs.terrains}/${NOMBRE_TERRAINS}.`);

  for (const nom of horsDomaine) erreurs.push(`${nom} n'est pas dans les domaines de ta Légende.`);

  // Possession : on ne joue que ce que l'on a.
  for (const [code, n] of utilisationDuDeck(deck)) {
    const possede = possession.get(code) ?? 0;
    const c = parCode.get(code);
    if (c && n > possede) erreurs.push(`Tu as ${possede} × ${nomComplet(c)}, il en faut ${n}.`);
  }

  return { valide: erreurs.length === 0, erreurs, compteurs };
}

/** Nombre d'exemplaires de chaque carte qu'utilise un deck (Légende, champion, deck principal, runes, terrains). */
export function utilisationDuDeck(deck: ContenuDeck): Map<string, number> {
  const utilise = new Map<string, number>();
  const ajouter = (code: string | null, n = 1) => {
    if (code) utilise.set(code, (utilise.get(code) ?? 0) + n);
  };
  ajouter(deck.legende);
  ajouter(deck.champion);
  deck.principal.forEach((l) => ajouter(l.code, l.n));
  deck.runes.forEach((l) => ajouter(l.code, l.n));
  deck.terrains.forEach((code) => ajouter(code));
  return utilise;
}

/**
 * Export texte au format commun des sites de jeu Riftbound (TCG Arena, Rift Atlas, riftbound.gg, Piltover Archive) :
 * des sections « Legend: », « Champion: », « MainDeck: », « Battlefields: », « Runes: », puis une ligne « N Nom »
 * par carte (sans « x » ni code). Les variantes d'une même carte sont regroupées sous son nom.
 */
export function exporterTexte(deck: ContenuDeck, parCode: ReadonlyMap<string, Carte>, champions: Set<string>): string {
  const regrouper = (lignes: LigneDeck[]) => {
    const parNom = new Map<string, number>();
    for (const l of lignes) {
      const c = parCode.get(l.code);
      if (c) parNom.set(nomComplet(c), (parNom.get(nomComplet(c)) ?? 0) + l.n);
    }
    return [...parNom].map(([nom, n]) => `${n} ${nom}`);
  };
  const legende = deck.legende ? parCode.get(deck.legende) : undefined;
  const champion = deck.champion ? parCode.get(deck.champion) : undefined;
  const sections: Array<[string, string[]]> = [
    ["Legend:", legende ? [`1 ${nomLegende(legende, champions)}`] : []],
    ["Champion:", champion ? [`1 ${nomComplet(champion)}`] : []],
    ["MainDeck:", regrouper(deck.principal)],
    ["Battlefields:", regrouper(deck.terrains.map((code) => ({ code, n: 1 })))],
    ["Runes:", regrouper(deck.runes)],
  ];
  return sections
    .filter(([, lignes]) => lignes.length > 0)
    .map(([titre, lignes]) => [titre, ...lignes].join("\n"))
    .join("\n\n");
}
