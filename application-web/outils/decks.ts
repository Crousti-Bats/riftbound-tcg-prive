/** Éditeur de deck : modèle, placement automatique d'une carte dans la bonne zone, ajouts et retraits.
 *  Fonctions pures (testées dans decks.test.ts). Les règles complètes sont vérifiées par le serveur
 *  (serveur-api/decks/regles-deck.ts) ; ici, on évite seulement les ajouts impossibles. */
import type { Carte } from "./libelles-cartes";

export const TAILLE_PRINCIPAL = 40;
export const NOMBRE_RUNES = 12;
export const NOMBRE_TERRAINS = 3;
export const MAX_EXEMPLAIRES = 3;

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

export interface ValidationDeck {
  valide: boolean;
  erreurs: string[];
  compteurs: { principal: number; runes: number; terrains: number };
}

/** Réponse de GET/POST /api/decks/:id. */
export interface AnalyseDeck {
  id: number;
  nom: string;
  modifieLe: number;
  contenu: ContenuDeck;
  cartes: Record<string, Carte>;
  possession: Record<string, number>;
  validation: ValidationDeck;
  export: string;
}

export type Zone = "legende" | "champion" | "principal" | "runes" | "terrains";

export const estChampion = (c: Pick<Carte, "type" | "etiquettes">) => c.type === "Unit" && c.etiquettes.includes("Champion");
export const estToken = (c: Pick<Carte, "type" | "variante" | "etiquettes">) =>
  c.variante === "token" || c.type === "Token" || c.etiquettes.includes("Token");

/** Domaines jouables avec une Légende (« Colorless » n'est pas un domaine). */
export const domainesDe = (c: Pick<Carte, "domaines">) => c.domaines.filter((d) => d !== "Colorless");

/** Combien de fois ce code est utilisé dans le deck (toutes zones). */
export function exemplairesUtilises(deck: ContenuDeck, code: string): number {
  return (
    (deck.legende === code ? 1 : 0) +
    (deck.champion === code ? 1 : 0) +
    deck.principal.filter((l) => l.code === code).reduce((t, l) => t + l.n, 0) +
    deck.runes.filter((l) => l.code === code).reduce((t, l) => t + l.n, 0) +
    deck.terrains.filter((c) => c === code).length
  );
}

const somme = (lignes: LigneDeck[]) => lignes.reduce((t, l) => t + l.n, 0);
export const compterPrincipal = (deck: ContenuDeck) => somme(deck.principal) + (deck.champion ? 1 : 0);
export const compterRunes = (deck: ContenuDeck) => somme(deck.runes);

/** La zone où va une carte cliquée dans la collection (null : elle ne va pas dans un deck, ex. un token). */
export function zoneDeCarte(carte: Carte, deck: ContenuDeck, cartes: Record<string, Carte>): Zone | null {
  if (estToken(carte)) return null;
  if (carte.type === "Legend") return "legende";
  if (carte.type === "Battlefield") return "terrains";
  if (carte.type === "Rune") return "runes";
  if (estChampion(carte) && !deck.champion) {
    const legende = deck.legende ? cartes[deck.legende] : undefined;
    // Sans Légende, le premier champion devient le champion choisi ; avec, seulement celui de la Légende.
    if (!legende || (legende.tags ?? []).includes(carte.nom)) return "champion";
  }
  return "principal";
}

export type ResultatAjout = { ok: true; deck: ContenuDeck } | { ok: false; raison: string };

const nomComplet = (c: Pick<Carte, "nom" | "sousTitre">) => (c.sousTitre ? `${c.nom}, ${c.sousTitre}` : c.nom);

/** Ajoute une carte dans sa zone, si c'est possible (possession, limites de zone, 3 exemplaires d'un même nom). */
export function ajouterCarte(deck: ContenuDeck, carte: Carte, possedees: number, cartes: Record<string, Carte>): ResultatAjout {
  const zone = zoneDeCarte(carte, deck, cartes);
  if (!zone) return { ok: false, raison: "Les tokens ne vont pas dans un deck." };
  const utilises = exemplairesUtilises(deck, carte.code);
  const remplacee = zone === "legende" && deck.legende === carte.code ? 1 : 0;
  if (utilises - remplacee >= possedees) return { ok: false, raison: `Tu n'as que ${possedees} × ${nomComplet(carte)}.` };

  switch (zone) {
    case "legende":
      return { ok: true, deck: { ...deck, legende: carte.code } };
    case "champion":
      return { ok: true, deck: { ...deck, champion: carte.code } };
    case "terrains": {
      if (deck.terrains.length >= NOMBRE_TERRAINS) return { ok: false, raison: `Déjà ${NOMBRE_TERRAINS} champs de bataille.` };
      const nomDe = (code: string) => {
        const c = cartes[code];
        return c ? nomComplet(c) : null;
      };
      if (deck.terrains.some((code) => nomDe(code) === nomComplet(carte))) {
        return { ok: false, raison: "Ce champ de bataille est déjà dans le deck." };
      }
      return { ok: true, deck: { ...deck, terrains: [...deck.terrains, carte.code] } };
    }
    case "runes":
      if (compterRunes(deck) >= NOMBRE_RUNES) return { ok: false, raison: `Déjà ${NOMBRE_RUNES} runes.` };
      return { ok: true, deck: { ...deck, runes: incrementer(deck.runes, carte.code) } };
    case "principal": {
      const nom = nomComplet(carte);
      const memeNomQue = (code: string | null) => {
        const c = code ? cartes[code] : undefined;
        return c !== undefined && nomComplet(c) === nom;
      };
      const memeNom = deck.principal.reduce((t, l) => t + (memeNomQue(l.code) ? l.n : 0), 0) + (memeNomQue(deck.champion) ? 1 : 0);
      if (memeNom >= MAX_EXEMPLAIRES) return { ok: false, raison: `${MAX_EXEMPLAIRES} exemplaires au maximum de ${nomComplet(carte)}.` };
      return { ok: true, deck: { ...deck, principal: incrementer(deck.principal, carte.code) } };
    }
  }
}

function incrementer(lignes: LigneDeck[], code: string): LigneDeck[] {
  return lignes.some((l) => l.code === code)
    ? lignes.map((l) => (l.code === code ? { ...l, n: l.n + 1 } : l))
    : [...lignes, { code, n: 1 }];
}

/** Retire un exemplaire d'une zone (la Légende et le champion se retirent entièrement). */
export function retirerCarte(deck: ContenuDeck, zone: Zone, code: string): ContenuDeck {
  const decrementer = (lignes: LigneDeck[]) =>
    lignes.flatMap((l) => (l.code !== code ? [l] : l.n > 1 ? [{ ...l, n: l.n - 1 }] : []));
  switch (zone) {
    case "legende":
      return { ...deck, legende: deck.legende === code ? null : deck.legende };
    case "champion":
      return { ...deck, champion: deck.champion === code ? null : deck.champion };
    case "terrains":
      return { ...deck, terrains: deck.terrains.filter((c) => c !== code) };
    case "runes":
      return { ...deck, runes: decrementer(deck.runes) };
    case "principal":
      return { ...deck, principal: decrementer(deck.principal) };
  }
}

/** Ordre d'affichage du deck principal : par type (unités, sorts, équipements…), puis par coût et par nom. */
const ORDRE_TYPES: Record<string, number> = { Unit: 0, Spell: 1, Gear: 2 };
export function grouperParType(lignes: LigneDeck[], cartes: Record<string, Carte>): Array<{ type: string; lignes: LigneDeck[]; total: number }> {
  const groupes = new Map<string, LigneDeck[]>();
  for (const l of lignes) {
    const type = cartes[l.code]?.type ?? "?";
    groupes.set(type, [...(groupes.get(type) ?? []), l]);
  }
  return [...groupes]
    .sort(([a], [b]) => (ORDRE_TYPES[a] ?? 9) - (ORDRE_TYPES[b] ?? 9) || a.localeCompare(b))
    .map(([type, ls]) => ({
      type,
      total: somme(ls),
      lignes: [...ls].sort((x, y) => {
        const cx = cartes[x.code];
        const cy = cartes[y.code];
        return (cx?.energie ?? 99) - (cy?.energie ?? 99) || (cx?.nom ?? "").localeCompare(cy?.nom ?? "");
      }),
    }));
}
