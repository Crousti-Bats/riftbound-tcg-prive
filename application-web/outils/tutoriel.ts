/**
 * Tutoriel interactif (/tutoriel) : une partie solo guidée sur la vraie table, contre un adversaire scripté.
 * Tout se passe dans le navigateur avec le moteur de la table (serveur-api/table/moteur-table.ts, sans réseau) : rien
 * n'est enregistré, rien n'est tiré au sort (mains, pioches et runes sont fixées pour que le scénario tienne).
 * Toi : deck de démo Annie (Fury + Chaos). L'adversaire : deck de démo Garen (Body + Order). Trois tours.
 * Chaque étape se valide toute seule quand la table est dans le bon état ; « Montre-moi » joue l'étape à ta place.
 */
import { DECKS_DEMO } from "../../serveur-api/decks/decks-demo";
import type { ContenuDeck } from "../../serveur-api/decks/regles-deck";
import {
  type ActionTable,
  type DeckDeTable,
  type EtatTable,
  type IndexJoueur,
  type VueTable,
  aleatoireCrypto,
  appliquerAction,
  creerPartie,
  idZone,
  vuePour,
} from "../../serveur-api/table/moteur-table";

/** Cartes du scénario (codes du catalogue). */
export const C = {
  // Toi (Annie)
  annie: "ogs-010-024", // Annie, Stubborn : 4 énergie + 1 Chaos, Might 3. En jeu : renvoie un sort de ta défausse en main.
  rearguard: "ogn-010-298", // Legion Rearguard : 2 énergie, Might 2, Accelerate.
  duo: "ogn-016-298", // Dangerous Duo : 3 énergie, Might 3, Legion.
  voidSeeker: "ogn-024-298", // Void Seeker : Action, 3 énergie + 1 Fury, 4 dégâts à une unité sur un champ de bataille, pioche 1.
  cleave: "ogn-004-298",
  fallingStar: "ogn-029-298",
  hopeful: "ogn-012-298",
  chompers: "ogn-006-298",
  tideturner: "ogn-199-298",
  fury: "ogn-007-298",
  chaos: "ogn-166-298",
  monastere: "ogn-282-298", // Monastery of Hirana
  // L'adversaire (Garen)
  corsair: "ogn-130-298", // Crackshot Corsair : 3 énergie, Might 3. Quand il attaque : 1 dégât à une unité ennemie là.
  rookie: "ogn-136-298", // Pit Rookie : 2 énergie, Might 2.
  firstMate: "ogn-132-298", // First Mate : 3 énergie, Might 3. En jeu : redresse une autre unité.
  sabotage: "ogn-156-298",
  cithria: "ogn-139-298",
  kraken: "ogn-150-298",
  body: "ogn-126-298",
  order: "ogn-214-298",
  arbre: "ogn-278-298", // Bandle Tree
} as const;

export const MOI: IndexJoueur = 0;
export const ADVERSAIRE: IndexJoueur = 1;
export const PSEUDO_ADVERSAIRE = "Garen (ordinateur)";

// ---------- Mise en place ----------

const deplier = (lignes: Array<{ code: string; n: number }>) => lignes.flatMap((l) => Array<string>(l.n).fill(l.code));
function deckDeTable(contenu: ContenuDeck): DeckDeTable {
  return {
    legende: contenu.legende ?? "",
    champion: contenu.champion ?? "",
    principal: deplier(contenu.principal),
    runes: deplier(contenu.runes),
    terrains: [...contenu.terrains],
  };
}

/** Prend, dans `ids`, une carte par code demandé (dans l'ordre) ; renvoie les cartes prises et le reste. */
function prendre(etat: EtatTable, ids: string[], codes: readonly string[]): { pris: string[]; reste: string[] } {
  const reste = [...ids];
  const pris: string[] = [];
  for (const code of codes) {
    const i = reste.findIndex((id) => etat.cartes[id]?.code === code);
    if (i >= 0) pris.push(...reste.splice(i, 1));
  }
  return { pris, reste };
}

/** Fixe la main de départ, l'ordre du dessus du deck et l'ordre des runes d'un joueur. */
function arranger(etat: EtatTable, j: IndexJoueur, main: readonly string[], dessus: readonly string[], runes: readonly string[]) {
  const pioche = [...(etat.zones[idZone(j, "main")] ?? []), ...(etat.zones[idZone(j, "deck")] ?? [])];
  const m = prendre(etat, pioche, main);
  const d = prendre(etat, m.reste, dessus);
  etat.zones[idZone(j, "main")] = m.pris;
  etat.zones[idZone(j, "deck")] = [...d.pris, ...d.reste];
  const r = prendre(etat, etat.zones[idZone(j, "runes")] ?? [], runes);
  etat.zones[idZone(j, "runes")] = [...r.pris, ...r.reste];
}

/** Pose un champ de bataille précis sur la table (les autres restent dans « Champs dispo »). */
function poserChamp(etat: EtatTable, j: IndexJoueur, n: number, code: string) {
  const tous = [...(etat.zones[`champ.${n}`] ?? []), ...(etat.zones[idZone(j, "terrains")] ?? [])];
  const { pris, reste } = prendre(etat, tous, [code]);
  etat.zones[`champ.${n}`] = pris;
  etat.zones[idZone(j, "terrains")] = reste;
}

/** La partie du tutoriel, toujours la même. */
export function preparerTutoriel(pseudo: string, maintenant: number): EtatTable {
  const [annie, garen] = DECKS_DEMO;
  if (!annie || !garen) throw new Error("decks de démo absents");
  const etat = creerPartie(
    "TUTORIEL",
    [
      { id: 0, pseudo, deck: deckDeTable(annie.contenu) },
      { id: -1, pseudo: PSEUDO_ADVERSAIRE, deck: deckDeTable(garen.contenu) },
    ],
    () => 0.5,
    maintenant,
  );
  etat.premier = MOI;
  arranger(
    etat,
    MOI,
    [C.rearguard, C.duo, C.voidSeeker, C.cleave],
    [C.fallingStar, C.hopeful, C.chompers, C.tideturner],
    [C.fury, C.chaos, C.fury, C.fury, C.chaos, C.fury],
  );
  arranger(etat, ADVERSAIRE, [C.corsair, C.rookie, C.firstMate, C.sabotage], [C.cithria, C.kraken], [C.body, C.order, C.body, C.order, C.body]);
  poserChamp(etat, MOI, 0, C.monastere);
  poserChamp(etat, ADVERSAIRE, 1, C.arbre);
  etat.journal = [{ t: maintenant, j: null, texte: `Partie d'entraînement contre ${PSEUDO_ADVERSAIRE}. ${pseudo} commence.` }];
  return etat;
}

// ---------- Lecture de l'état ----------

const ids = (etat: EtatTable, zone: string) => etat.zones[zone] ?? [];
const nombre = (etat: EtatTable, zone: string) => ids(etat, zone).length;
/** Première carte de ce code dans cette zone. */
export const carteDans = (etat: EtatTable, zone: string, code: string) => ids(etat, zone).find((id) => etat.cartes[id]?.code === code);
const estDans = (etat: EtatTable, zone: string, code: string) => carteDans(etat, zone, code) !== undefined;
const inclinee = (etat: EtatTable, id: string | undefined) => Boolean(id && etat.cartes[id]?.inclinee);
const runesPretes = (etat: EtatTable, j: IndexJoueur) => ids(etat, idZone(j, "reserve")).filter((id) => !etat.cartes[id]?.inclinee);
const runesInclinees = (etat: EtatTable, j: IndexJoueur) => ids(etat, idZone(j, "reserve")).filter((id) => etat.cartes[id]?.inclinee);
const rienIncline = (etat: EtatTable, j: IndexJoueur) => !Object.values(etat.cartes).some((c) => c.proprio === j && c.inclinee);
const points = (etat: EtatTable, j: IndexJoueur) => etat.joueurs[j].points;

/** Une action à jouer, calculée au moment de la jouer (les cartes ont pu bouger entre-temps). null : rien à faire. */
export type Pas = (etat: EtatTable) => ActionTable | null;

const pas = {
  incliner: (trouver: (etat: EtatTable) => string | undefined): Pas => (etat) => {
    const id = trouver(etat);
    return id && !inclinee(etat, id) ? { type: "incliner", carte: id } : null;
  },
  redresser: (trouver: (etat: EtatTable) => string | undefined): Pas => (etat) => {
    const id = trouver(etat);
    return id && inclinee(etat, id) ? { type: "incliner", carte: id } : null;
  },
  deplacer: (trouver: (etat: EtatTable) => string | undefined, vers: string, position?: "dessous"): Pas => (etat) => {
    const id = trouver(etat);
    return id ? { type: "deplacer", carte: id, vers, ...(position ? { position } : {}) } : null;
  },
  fixe: (action: ActionTable): Pas => () => action,
};
/** Incline n runes prêtes (une par pas). */
const inclinerRunes = (j: IndexJoueur, n: number): Pas[] => Array.from({ length: n }, () => pas.incliner((etat) => runesPretes(etat, j)[0]));
/** Recycle une rune de ce domaine : elle retourne sous le deck de runes (on prend d'abord une rune déjà inclinée). */
const recycler = (j: IndexJoueur, code: string): Pas =>
  pas.deplacer((etat) => {
    const candidates = ids(etat, idZone(j, "reserve")).filter((id) => etat.cartes[id]?.code === code);
    return candidates.find((id) => inclinee(etat, id)) ?? candidates[0];
  }, idZone(j, "runes"), "dessous");
/** Jouer une unité : de la main (ou de la zone de champion) vers la base, puis l'incliner (elle arrive inclinée). */
const jouerUnite = (j: IndexJoueur, code: string, depuis: "main" | "champion" = "main"): Pas[] => [
  pas.deplacer((etat) => carteDans(etat, idZone(j, depuis), code), idZone(j, "base")),
  pas.incliner((etat) => carteDans(etat, idZone(j, "base"), code)),
];
const unite = (j: IndexJoueur, code: string) => (etat: EtatTable) =>
  [idZone(j, "base"), "champ.0", "champ.1"].map((z) => carteDans(etat, z, code)).find(Boolean);

// ---------- Les étapes ----------

export interface EtapeTutoriel {
  titre: string;
  /** Paragraphes ; **gras** pour les mots importants. */
  texte: string[];
  /** Ce qu'il faut faire, pas à pas. */
  consignes?: string[];
  /** L'étape est franchie quand c'est vrai (`depart` : la table au début de l'étape). Absent : bouton « Suivant ». */
  reussie?: (etat: EtatTable, depart: EtatTable) => boolean;
  /** « Montre-moi » : le tutoriel joue l'étape à ta place. */
  aide?: Pas[];
  /** Étape sans condition : libellé du bouton, et actions qu'il joue pour toi. */
  bouton?: string;
  surBouton?: Pas[];
  /** Tour de l'adversaire : ses actions, jouées une à une au début de l'étape ; on passe ensuite à la suite. */
  adversaire?: Pas[];
}

const M = MOI;
const A = ADVERSAIRE;

export const ETAPES: readonly EtapeTutoriel[] = [
  {
    titre: "Bienvenue sur la table",
    texte: [
      "Tu joues **Annie** (deck de démo Fury + Chaos) contre **Garen**, joué par l'ordinateur. Ton côté est en bas, le sien en haut.",
      "À gauche de ton côté : ta **Légende** (Dark Child) et ton **champion** (Annie), prêts à servir. Au milieu de la table : les **2 champs de bataille**, un tiré dans chaque deck. Le premier à **8 points** gagne, en contrôlant ces champs.",
      "Clique sur n'importe quelle carte pour la voir en grand, avec son texte et ce que tu peux en faire.",
    ],
    bouton: "C'est parti",
  },
  {
    titre: "Ta main de départ",
    texte: [
      "Tu as pioché **4 cartes** (en bas de l'écran). Avant de jouer, tu peux faire **une fois** un mulligan : remettre jusqu'à 2 cartes sous ton deck et en piocher autant.",
      "Ici, ta main est bonne : des unités pas chères et un sort utile. Garde-la.",
    ],
    bouton: "Garder ma main",
    surBouton: [pas.fixe({ type: "mulligan", cartes: [] })],
  },
  {
    titre: "Tour 1 · Canaliser 2 runes",
    texte: [
      "Tu commences. Ton tour commence par le **Réveil** (rien à redresser pour l'instant), puis tu **canalises 2 runes** : elles passent du deck de runes à ta réserve. Ce sont elles qui paient tes cartes.",
    ],
    consignes: ["Clique 2 fois sur ton paquet « Runes » (à droite de ton côté), ou 2 fois sur « Canaliser une rune »."],
    reussie: (etat, depart) => nombre(etat, idZone(M, "reserve")) >= nombre(depart, idZone(M, "reserve")) + 2,
    aide: [pas.fixe({ type: "canaliser", n: 2 })],
  },
  {
    titre: "Tour 1 · Piocher",
    texte: ["Ensuite, tu **pioches 1 carte**. Il n'y a pas de limite de cartes en main."],
    consignes: ["Clique sur ton paquet « Deck », ou sur « Piocher »."],
    reussie: (etat, depart) => nombre(etat, idZone(M, "main")) >= nombre(depart, idZone(M, "main")) + 1,
    aide: [pas.fixe({ type: "piocher", n: 1 })],
  },
  {
    titre: "Tour 1 · Jouer une unité",
    texte: [
      "**Legion Rearguard** coûte **2** (le nombre en haut à gauche) : c'est de l'**énergie**. Pour la payer, on **incline** (tourne) 2 runes.",
      "Une unité arrive **inclinée** : elle ne pourra pas bouger avant ton prochain tour.",
    ],
    consignes: [
      "Clique sur chacune de tes 2 runes → « Incliner ».",
      "Clique sur Legion Rearguard dans ta main → « Base ».",
      "Clique sur Legion Rearguard dans ta base → « Incliner ».",
    ],
    reussie: (etat) => inclinee(etat, carteDans(etat, idZone(M, "base"), C.rearguard)) && runesInclinees(etat, M).length >= 2,
    aide: [...inclinerRunes(M, 2), ...jouerUnite(M, C.rearguard)],
  },
  {
    titre: "Tour 1 · Fin du tour",
    texte: [
      "Tu n'as plus de runes prêtes : ton tour s'arrête là. Mais ta Légende, **Dark Child**, dit : « à la fin de ton tour, redresse jusqu'à 2 runes ». Profitons-en.",
    ],
    consignes: ["Clique sur chacune de tes runes inclinées → « Redresser »."],
    reussie: (etat) => runesInclinees(etat, M).length === 0,
    aide: [pas.redresser((etat) => runesInclinees(etat, M)[0]), pas.redresser((etat) => runesInclinees(etat, M)[0])],
  },
  {
    titre: "Tour de Garen",
    texte: [
      "Garen redresse ses cartes, puis canalise **3 runes** : le joueur qui commence en second en reçoit une de plus à son premier tour.",
      "Il pioche, puis joue **Crackshot Corsair** (3 énergie) dans sa base. Regarde le journal à droite (ou en bas sur téléphone).",
    ],
    adversaire: [
      pas.fixe({ type: "redresser" }),
      pas.fixe({ type: "canaliser", n: 3 }),
      pas.fixe({ type: "piocher", n: 1 }),
      ...inclinerRunes(A, 3),
      ...jouerUnite(A, C.corsair),
      pas.fixe({ type: "dire", texte: "À toi !" }),
    ],
  },
  {
    titre: "Tour 2 · Réveil",
    texte: [
      "Nouveau tour. **Réveil** : tu redresses toutes tes cartes inclinées (unités, runes, Légende). Legion Rearguard est de nouveau prête.",
      "Puis vient le **Début** du tour : tu marques 1 point par champ de bataille que tu contrôles. Tu n'en contrôles aucun : pas de point pour l'instant.",
    ],
    consignes: ["Clique sur « Tout redresser »."],
    reussie: (etat) => rienIncline(etat, M),
    aide: [pas.fixe({ type: "redresser" })],
  },
  {
    titre: "Tour 2 · Canaliser et piocher",
    texte: ["Comme à chaque tour : **2 runes**, puis **1 carte**."],
    consignes: ["Canalise 2 runes, puis pioche 1 carte."],
    reussie: (etat, depart) =>
      nombre(etat, idZone(M, "reserve")) >= nombre(depart, idZone(M, "reserve")) + 2 &&
      nombre(etat, idZone(M, "main")) >= nombre(depart, idZone(M, "main")) + 1,
    aide: [pas.fixe({ type: "canaliser", n: 2 }), pas.fixe({ type: "piocher", n: 1 })],
  },
  {
    titre: "Tour 2 · Bouger et conquérir",
    texte: [
      "Pour se déplacer, une unité **s'incline** : de ta base vers un champ de bataille (ou l'inverse).",
      "Le champ de bataille 1 est **vide** : il suffit d'y arriver pour le **conquérir**, et la conquête rapporte **1 point**. Tu le contrôles tant qu'il te reste une unité dessus.",
    ],
    consignes: [
      "Clique sur Legion Rearguard → « Incliner », puis → « Champ de bataille 1 ».",
      "Marque ton point avec le « + » à côté de ton score (en haut).",
    ],
    reussie: (etat, depart) => inclinee(etat, carteDans(etat, "champ.0", C.rearguard)) && points(etat, M) >= points(depart, M) + 1,
    aide: [
      pas.incliner(unite(M, C.rearguard)),
      pas.deplacer((etat) => carteDans(etat, idZone(M, "base"), C.rearguard), "champ.0"),
      pas.fixe({ type: "points", delta: 1 }),
    ],
  },
  {
    titre: "Tour 2 · Une autre unité",
    texte: [
      "Avec tes 4 runes, joue **Dangerous Duo** (3 énergie) dans ta base.",
      "Son effet **Legion** ne s'active que si tu as déjà joué une autre carte ce tour-ci. Déplacer une unité ne compte pas : pas de bonus cette fois.",
    ],
    consignes: ["Incline 3 runes.", "Dangerous Duo → « Base », puis « Incliner »."],
    reussie: (etat) => inclinee(etat, carteDans(etat, idZone(M, "base"), C.duo)) && runesInclinees(etat, M).length >= 3,
    aide: [...inclinerRunes(M, 3), ...jouerUnite(M, C.duo)],
  },
  {
    titre: "Tour 2 · Fin du tour",
    texte: [
      "Encore Dark Child : à la fin de ton tour, redresse **2 runes**. Tu auras ainsi **3 runes prêtes pendant le tour de Garen**. Garde-les, elles vont servir.",
    ],
    consignes: ["Redresse 2 de tes runes inclinées."],
    reussie: (etat) => runesPretes(etat, M).length >= 3,
    aide: [pas.redresser((etat) => runesInclinees(etat, M)[0]), pas.redresser((etat) => runesInclinees(etat, M)[0])],
  },
  {
    titre: "Tour de Garen · Il attaque !",
    texte: [
      "Garen redresse, canalise, pioche… et envoie **Crackshot Corsair** sur ton champ de bataille 1. Une unité qui arrive sur un champ occupé par l'adversaire déclenche un **combat**.",
      "Quand il attaque, Crackshot Corsair inflige **1 dégât** à une unité ennemie : un marqueur sur ta Legion Rearguard.",
    ],
    adversaire: [
      pas.fixe({ type: "redresser" }),
      pas.fixe({ type: "canaliser", n: 2 }),
      pas.fixe({ type: "piocher", n: 1 }),
      pas.incliner(unite(A, C.corsair)),
      pas.deplacer(unite(A, C.corsair), "champ.0"),
      (etat) => {
        const id = carteDans(etat, "champ.0", C.rearguard);
        return id ? { type: "marqueur", carte: id, delta: 1 } : null;
      },
      pas.fixe({ type: "dire", texte: "Crackshot Corsair attaque ton champ de bataille 1 !" }),
    ],
  },
  {
    titre: "Affrontement · Réagis !",
    texte: [
      "Si on se bat maintenant : Corsair (Might **3**) contre Rearguard (Might **2**). Ta Rearguard mourrait et Garen prendrait ton champ.",
      "Mais avant les dégâts vient l'**affrontement** : chacun peut jouer des cartes **Action** ou **Réaction**, même pendant le tour adverse. **Void Seeker** est une Action : 4 dégâts à une unité sur un champ de bataille, et tu pioches 1 carte.",
      "Son coût : **3 énergie** (incliner 3 runes) et **1 symbole Fury** : c'est la **puissance**. On la paie en **recyclant** une rune Fury, c'est-à-dire en la remettant sous le deck de runes (même une rune que tu viens d'incliner).",
    ],
    consignes: [
      "Incline tes 3 runes prêtes.",
      "Clique sur une rune Fury (rouge) → « Sous le deck de runes ».",
      "Void Seeker → « Défausse » (un sort fait son effet puis part à la défausse).",
      "4 dégâts ≥ Might 3 : Crackshot Corsair meurt. Clique dessus → « Défausse » (il va dans SA défausse).",
      "Pioche 1 carte.",
    ],
    reussie: (etat, depart) =>
      estDans(etat, idZone(M, "defausse"), C.voidSeeker) &&
      estDans(etat, idZone(A, "defausse"), C.corsair) &&
      nombre(etat, idZone(M, "runes")) > nombre(depart, idZone(M, "runes")) &&
      nombre(etat, idZone(M, "main")) >= nombre(depart, idZone(M, "main")),
    aide: [
      ...inclinerRunes(M, 3),
      recycler(M, C.fury),
      pas.deplacer((etat) => carteDans(etat, idZone(M, "main"), C.voidSeeker), idZone(M, "defausse")),
      pas.deplacer((etat) => carteDans(etat, "champ.0", C.corsair), idZone(A, "defausse")),
      pas.fixe({ type: "piocher", n: 1 }),
    ],
  },
  {
    titre: "Fin du combat",
    texte: [
      "Il ne reste plus d'attaquant : Garen ne conquiert pas, tu **gardes ton champ de bataille**. (S'il ne restait que des attaquants, ils l'auraient conquis ; s'il reste un défenseur, les attaquants survivants rentrent à leur base.)",
      "Après un combat, **toutes les unités guérissent** : on retire les dégâts.",
    ],
    consignes: ["Clique sur Legion Rearguard → « − marqueur »."],
    reussie: (etat) => {
      const id = unite(M, C.rearguard)(etat);
      return !id || etat.cartes[id]?.marqueurs === 0;
    },
    aide: [
      (etat) => {
        const id = unite(M, C.rearguard)(etat);
        const n = id ? (etat.cartes[id]?.marqueurs ?? 0) : 0;
        return id && n !== 0 ? { type: "marqueur", carte: id, delta: -n } : null;
      },
    ],
  },
  {
    titre: "Tour de Garen · Il se renforce",
    texte: [
      "Garen joue **Pit Rookie** puis **First Mate**, qui redresse une autre unité (Pit Rookie). Ses deux unités restent dans sa base : aucune ne garde de champ de bataille.",
    ],
    adversaire: [
      ...inclinerRunes(A, 2),
      ...jouerUnite(A, C.rookie),
      ...inclinerRunes(A, 3),
      ...jouerUnite(A, C.firstMate),
      pas.redresser((etat) => carteDans(etat, idZone(A, "base"), C.rookie)),
      pas.fixe({ type: "dire", texte: "Fin de mon tour." }),
    ],
  },
  {
    titre: "Tour 3 · Réveil et tenir",
    texte: [
      "Réveil : redresse tout. Puis, au début de ton tour, tu **tiens** le champ de bataille 1 (tu y as toujours une unité) : **+1 point**.",
      "Tenir un champ rapporte 1 point **à chacun de tes tours** : c'est le cœur du jeu.",
    ],
    consignes: ["« Tout redresser », puis « + » à côté de ton score."],
    reussie: (etat, depart) => rienIncline(etat, M) && points(etat, M) >= points(depart, M) + 1,
    aide: [pas.fixe({ type: "redresser" }), pas.fixe({ type: "points", delta: 1 })],
  },
  {
    titre: "Tour 3 · Canaliser et piocher",
    texte: ["Tu connais la suite : 2 runes, 1 carte."],
    consignes: ["Canalise 2 runes, puis pioche 1 carte."],
    reussie: (etat, depart) =>
      nombre(etat, idZone(M, "reserve")) >= nombre(depart, idZone(M, "reserve")) + 2 &&
      nombre(etat, idZone(M, "main")) >= nombre(depart, idZone(M, "main")) + 1,
    aide: [pas.fixe({ type: "canaliser", n: 2 }), pas.fixe({ type: "piocher", n: 1 })],
  },
  {
    titre: "Tour 3 · Un deuxième champ",
    texte: [
      "Le champ de bataille 2 est vide, et les unités de Garen sont dans sa base. Envoie **Dangerous Duo** le conquérir : encore **1 point**.",
      "Ta Rearguard, elle, ne peut pas y aller directement : passer d'un champ de bataille à un autre demande le mot-clé **Ganking**.",
    ],
    consignes: ["Dangerous Duo → « Incliner », puis « Champ de bataille 2 ».", "« + » à côté de ton score."],
    reussie: (etat, depart) => estDans(etat, "champ.1", C.duo) && points(etat, M) >= points(depart, M) + 1,
    aide: [
      pas.incliner(unite(M, C.duo)),
      pas.deplacer((etat) => carteDans(etat, idZone(M, "base"), C.duo), "champ.1"),
      pas.fixe({ type: "points", delta: 1 }),
    ],
  },
  {
    titre: "Tour 3 · Ton champion entre en jeu",
    texte: [
      "**Annie, Stubborn** attend dans ta zone de champion. Elle coûte **4 énergie + 1 Chaos**. Quand tu la joues, elle **renvoie un sort de ta défausse dans ta main** : Void Seeker revient !",
    ],
    consignes: [
      "Incline 4 runes, puis recycle une rune Chaos (violette) → « Sous le deck de runes ».",
      "Annie (zone de champion) → « Base », puis « Incliner ».",
      "Ouvre ta défausse → Void Seeker → « Main ».",
    ],
    reussie: (etat) => estDans(etat, idZone(M, "base"), C.annie) && estDans(etat, idZone(M, "main"), C.voidSeeker),
    aide: [
      ...inclinerRunes(M, 4),
      recycler(M, C.chaos),
      ...jouerUnite(M, C.annie, "champion"),
      pas.deplacer((etat) => carteDans(etat, idZone(M, "defausse"), C.voidSeeker), idZone(M, "main")),
    ],
  },
  {
    titre: "Bravo, tu sais jouer !",
    texte: [
      "Tu as **3 points** et tu tiens **2 champs de bataille** : au début de ton prochain tour, **+2 points**.",
      "Dernière règle : le **8e point** ne peut pas venir d'une simple conquête. Il faut le marquer en **tenant** un champ, ou en conquérant **tous** les champs dans le même tour. Sinon, tu pioches 1 carte à la place.",
      "Tu peux continuer cette partie librement (Garen ne jouera plus), relancer le tuto, ou défier un ami pour de vrai.",
    ],
    bouton: "Continuer librement",
  },
];

/** Joue une liste de pas jusqu'au bout avec la fonction donnée (tests, et « Montre-moi » sans animation). */
export function jouerPas(etat: EtatTable, liste: readonly Pas[], appliquer: (action: ActionTable) => void): void {
  for (const p of liste) {
    const action = p(etat);
    if (action) appliquer(action);
  }
}

// ---------- Le déroulé (hors de React : la page s'y abonne avec useSyncExternalStore) ----------

/** Délai entre deux gestes joués automatiquement (adversaire, « Montre-moi »), pour qu'on les voie se faire. */
export const DELAI_GESTE_MS = 650;
/** Le temps de lire « Bien joué ! » avant l'étape suivante. */
export const DELAI_BRAVO_MS = 1200;

export interface InstantTutoriel {
  vue: VueTable;
  etape: number;
  /** Étape réussie, la suivante arrive. */
  bravo: boolean;
  /** Des gestes se jouent tout seuls (tour de l'adversaire ou « Montre-moi »). */
  automatique: boolean;
  /** Tuto fini, partie libre. */
  libre: boolean;
  erreur: string | null;
  /** Change à chaque « Recommencer » (remet le plateau à zéro). */
  partie: number;
}

export class ControleurTutoriel {
  private etat: EtatTable;
  private depart: EtatTable;
  private instant: InstantTutoriel;
  private minuteurs: Array<ReturnType<typeof setTimeout>> = [];
  private readonly ecouteurs = new Set<() => void>();

  constructor(
    private readonly pseudo: string,
    private readonly messages: Record<string, string> = {},
  ) {
    this.etat = preparerTutoriel(pseudo, Date.now());
    this.depart = structuredClone(this.etat);
    this.instant = { vue: vuePour(this.etat, MOI), etape: 0, bravo: false, automatique: false, libre: false, erreur: null, partie: 0 };
  }

  abonner = (ecouteur: () => void) => {
    this.ecouteurs.add(ecouteur);
    return () => {
      this.ecouteurs.delete(ecouteur);
    };
  };
  lire = () => this.instant;
  /** La partie elle-même (tests). */
  lireEtat = () => this.etat;

  private publier(changement: Partial<InstantTutoriel> = {}) {
    this.instant = { ...this.instant, vue: vuePour(this.etat, MOI), ...changement };
    this.ecouteurs.forEach((e) => e());
  }

  private plusTard(f: () => void, delai: number) {
    this.minuteurs.push(setTimeout(f, delai));
  }

  arreter = () => {
    this.minuteurs.forEach((m) => clearTimeout(m));
    this.minuteurs = [];
  };

  recommencer = () => {
    this.arreter();
    this.etat = preparerTutoriel(this.pseudo, Date.now());
    this.publier({ libre: false, erreur: null, partie: this.instant.partie + 1 });
    this.passerA(0);
  };

  private passerA(n: number) {
    this.arreter();
    this.depart = structuredClone(this.etat);
    this.publier({ etape: n, bravo: false, automatique: false });
    const etape = ETAPES[n];
    if (etape?.adversaire) this.derouler(ADVERSAIRE, etape.adversaire, () => this.passerA(n + 1));
  }

  private appliquer(j: IndexJoueur, action: ActionTable) {
    const r = appliquerAction(this.etat, j, action, aleatoireCrypto, Date.now());
    this.publier({ erreur: r.ok ? null : (this.messages[r.erreur] ?? "Action refusée.") });
  }

  /** L'étape en cours est-elle réussie ? Alors « Bien joué ! », puis la suite. */
  private verifier() {
    const { etape, bravo, automatique, libre } = this.instant;
    const courante = ETAPES[etape];
    if (libre || bravo || automatique || !courante?.reussie || !courante.reussie(this.etat, this.depart)) return;
    this.publier({ bravo: true });
    this.plusTard(() => this.passerA(etape + 1), DELAI_BRAVO_MS);
  }

  /** Joue des gestes un par un, puis `fin` (ou la vérification de l'étape). */
  private derouler(j: IndexJoueur, liste: readonly Pas[], fin?: () => void) {
    this.publier({ automatique: true });
    const suivant = (i: number) => {
      if (i >= liste.length) {
        this.publier({ automatique: false });
        if (fin) fin();
        else this.verifier();
        return;
      }
      const action = liste[i]?.(this.etat);
      if (action) this.appliquer(j, action);
      this.plusTard(() => suivant(i + 1), action ? DELAI_GESTE_MS : 0);
    };
    this.plusTard(() => suivant(0), DELAI_GESTE_MS / 2);
  }

  /** Un geste du joueur sur la table. */
  envoyer = (action: ActionTable) => {
    if (this.instant.automatique && ETAPES[this.instant.etape]?.adversaire) {
      this.publier({ erreur: `Attends la fin du tour de ${PSEUDO_ADVERSAIRE}.` });
      return;
    }
    this.appliquer(MOI, action);
    this.verifier();
  };

  /** « Montre-moi » : le tuto joue l'étape à ta place. */
  montrer = () => {
    const courante = ETAPES[this.instant.etape];
    if (!this.instant.automatique && !this.instant.bravo && courante?.aide) this.derouler(MOI, courante.aide);
  };

  /** Bouton d'une étape sans condition (« C'est parti », « Garder ma main »…). */
  valider = () => {
    const n = this.instant.etape;
    const courante = ETAPES[n];
    if (!courante || courante.reussie || courante.adversaire) return;
    jouerPas(this.etat, courante.surBouton ?? [], (action) => this.appliquer(MOI, action));
    if (n === ETAPES.length - 1) this.publier({ libre: true });
    else this.passerA(n + 1);
  };

  effacerErreur = () => this.publier({ erreur: null });
}
