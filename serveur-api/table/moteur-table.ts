/**
 * Moteur de la table de jeu : état d'une partie à deux, actions des joueurs et vue de chacun.
 * Table « libre » : le site n'applique pas les règles de Riftbound, il transmet les gestes des joueurs (piocher,
 * jouer, déplacer, incliner…) et garde secrètes les informations cachées (ma main, l'ordre des decks).
 * Fonctions pures (aucun réseau, aucune base) : l'aléatoire est injecté. Testé dans tests/table.test.ts.
 * Aucune dépendance à l'exécution : le tutoriel (application-web/pages/page-tutoriel.tsx) l'utilise aussi dans le navigateur.
 */
import type { z } from "zod";
import type { schemaAction } from "./schema-action";

export type IndexJoueur = 0 | 1;

/** Zones de chaque joueur. Les zones « cachées » ne montrent que leur nombre de cartes (sauf la main, à son propriétaire). */
export const ZONES_JOUEUR = ["main", "deck", "runes", "reserve", "base", "defausse", "bannis", "legende", "champion", "terrains"] as const;
export type ZoneJoueur = (typeof ZONES_JOUEUR)[number];
const ZONES_CACHEES: ReadonlySet<string> = new Set(["main", "deck", "runes"]);
/** Zones « en jeu » : une carte qui les quitte perd ses marqueurs et se redresse. */
const ZONES_EN_JEU: ReadonlySet<string> = new Set(["reserve", "base", "legende", "champion", "terrains", "champ"]);
export const NOMBRE_CHAMPS = 2;
export const MAIN_DE_DEPART = 4;
export const MAX_JOURNAL = 150;

export interface CarteJeu {
  id: string;
  code: string;
  proprio: IndexJoueur;
  /** Face visible (une carte jouée face cachée n'est visible que de son propriétaire). */
  face: boolean;
  inclinee: boolean;
  marqueurs: number;
  /** Token créé pendant la partie : il disparaît dès qu'il quitte le jeu. */
  token?: true;
  /** Token « libre » (absent des données, ex. Bomb) : son nom, sans carte du catalogue (code vide). */
  libelle?: string;
  /** Champ de bataille (pas une unité) : ne compte ni pour conquérir ni pour tenir. */
  terrain?: true;
}

export interface EntreeJournal {
  t: number;
  /** Auteur (null : la table elle-même). */
  j: IndexJoueur | null;
  texte: string;
  /** Cartes citées : le client affiche leur nom à la place de {0}, {1}… */
  cartes?: string[];
}

export interface JoueurTable {
  id: number;
  pseudo: string;
  points: number;
}

export interface EtatTable {
  code: string;
  joueurs: [JoueurTable, JoueurTable];
  premier: IndexJoueur;
  /** Ordre des cartes de chaque zone. Deck et runes : l'indice 0 est le dessus. */
  zones: Record<string, string[]>;
  cartes: Record<string, CarteJeu>;
  journal: EntreeJournal[];
  /** Le mulligan n'est possible qu'une fois, avant d'avoir joué. */
  mulliganFait: [boolean, boolean];
  /** Codes des tokens du jeu que l'on peut créer (fournis par le Worker au lancement ; absent : parties plus anciennes). */
  tokens?: string[];
  commenceeLe: number;
  /** Incrémenté à chaque action (le client ignore une vue plus ancienne). */
  version: number;
  /** Nombre de « Début de mon tour » de chaque joueur (aide automatique ; absent : parties plus anciennes). */
  tours?: [number, number];
}

export interface DeckDeTable {
  legende: string;
  champion: string;
  principal: string[];
  runes: string[];
  terrains: string[];
}

export type Aleatoire = () => number;

export function aleatoireCrypto(): number {
  const tampon = new Uint32Array(1);
  crypto.getRandomValues(tampon);
  return (tampon[0] ?? 0) / 2 ** 32;
}

function melanger<T>(liste: T[], aleatoire: Aleatoire): T[] {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const k = Math.floor(aleatoire() * (i + 1));
    [copie[i], copie[k]] = [copie[k] as T, copie[i] as T];
  }
  return copie;
}

export const idZone = (j: IndexJoueur, zone: ZoneJoueur) => `${j}.${zone}`;
export const idChamp = (n: number) => `champ.${n}`;

/** Analyse un identifiant de zone : `0.main`, `1.base`, `champ.0`… */
export function lireZone(id: string): { proprio: IndexJoueur | null; zone: ZoneJoueur | "champ" } | null {
  const champ = /^champ\.(\d)$/.exec(id);
  if (champ) return Number(champ[1]) < NOMBRE_CHAMPS ? { proprio: null, zone: "champ" } : null;
  const m = /^([01])\.([a-z]+)$/.exec(id);
  if (!m || !(ZONES_JOUEUR as readonly string[]).includes(m[2] as string)) return null;
  return { proprio: Number(m[1]) as IndexJoueur, zone: m[2] as ZoneJoueur };
}

/** Mise en place : Légende, champion, decks mélangés, champs de bataille disponibles, 4 cartes en main. */
export function creerPartie(
  code: string,
  joueurs: [{ id: number; pseudo: string; deck: DeckDeTable }, { id: number; pseudo: string; deck: DeckDeTable }],
  aleatoire: Aleatoire,
  maintenant: number,
  tokens: string[] = [],
): EtatTable {
  const etat: EtatTable = {
    code,
    joueurs: [
      { id: joueurs[0].id, pseudo: joueurs[0].pseudo, points: 0 },
      { id: joueurs[1].id, pseudo: joueurs[1].pseudo, points: 0 },
    ],
    premier: aleatoire() < 0.5 ? 0 : 1,
    zones: {},
    cartes: {},
    journal: [],
    mulliganFait: [false, false],
    tokens,
    tours: [0, 0],
    commenceeLe: maintenant,
    version: 1,
  };
  for (let n = 0; n < NOMBRE_CHAMPS; n++) etat.zones[idChamp(n)] = [];
  let compteur = 0;
  ([0, 1] as const).forEach((j) => {
    for (const zone of ZONES_JOUEUR) etat.zones[idZone(j, zone)] = [];
    const deck = joueurs[j].deck;
    const poser = (zone: ZoneJoueur, codes: string[], face: boolean) => {
      for (const code of codes) {
        const id = `c${++compteur}`;
        etat.cartes[id] = { id, code, proprio: j, face, inclinee: false, marqueurs: 0 };
        etat.zones[idZone(j, zone)]?.push(id);
      }
    };
    poser("legende", [deck.legende], true);
    poser("champion", [deck.champion], true);
    poser("terrains", deck.terrains, true);
    for (const id of etat.zones[idZone(j, "terrains")] ?? []) {
      const terrain = etat.cartes[id];
      if (terrain) terrain.terrain = true;
    }
    // Duel (règle 487.5) : chaque joueur tire au hasard 1 de ses 3 champs de bataille, posé sur la table.
    // Les 2 autres restent dans « Champs dispo » (pour jouer en match, où l'on choisit soi-même).
    const dispo = etat.zones[idZone(j, "terrains")] ?? [];
    const tire = dispo.splice(Math.floor(aleatoire() * dispo.length), 1)[0];
    if (tire) etat.zones[idChamp(j)]?.push(tire);
    poser("deck", melanger(deck.principal, aleatoire), false);
    poser("runes", melanger(deck.runes, aleatoire), false);
    deplacerDessus(etat, j, "deck", "main", MAIN_DE_DEPART);
  });
  const second = etat.joueurs[etat.premier === 0 ? 1 : 0].pseudo;
  journaliser(
    etat,
    null,
    `Partie lancée. ${etat.joueurs[etat.premier].pseudo} commence. Champs de bataille tirés au sort, ${MAIN_DE_DEPART} cartes chacun. ${second} canalise 3 runes à son premier tour au lieu de 2.`,
    maintenant,
  );
  return etat;
}

function journaliser(etat: EtatTable, j: IndexJoueur | null, texte: string, t: number, cartes?: string[]): void {
  etat.journal.push(cartes?.length ? { t, j, texte, cartes } : { t, j, texte });
  if (etat.journal.length > MAX_JOURNAL) etat.journal.splice(0, etat.journal.length - MAX_JOURNAL);
}

/** Déplace les n cartes du dessus d'une zone cachée vers une autre zone du même joueur. Renvoie le nombre déplacé. */
function deplacerDessus(etat: EtatTable, j: IndexJoueur, de: ZoneJoueur, vers: ZoneJoueur, n: number): number {
  const source = etat.zones[idZone(j, de)] ?? [];
  const pris = source.splice(0, n);
  const face = !ZONES_CACHEES.has(vers);
  for (const id of pris) {
    const carte = etat.cartes[id];
    if (carte) carte.face = face;
  }
  etat.zones[idZone(j, vers)]?.push(...pris);
  return pris.length;
}

function zoneDe(etat: EtatTable, idCarte: string): string | null {
  for (const [zone, ids] of Object.entries(etat.zones)) if (ids.includes(idCarte)) return zone;
  return null;
}

/** Unités d'un joueur sur un champ de bataille (sans la carte du champ lui-même). */
function unitesSur(etat: EtatTable, n: number, j: IndexJoueur): string[] {
  return (etat.zones[idChamp(n)] ?? []).filter((id) => {
    const carte = etat.cartes[id];
    return carte && carte.proprio === j && !carte.terrain;
  });
}

/** Champs de bataille que je contrôle : au moins une de mes unités, aucune de l'adversaire. */
function champsControles(etat: EtatTable, j: IndexJoueur): number[] {
  const autre = (1 - j) as IndexJoueur;
  return Array.from({ length: NOMBRE_CHAMPS }, (_, n) => n).filter((n) => unitesSur(etat, n, j).length > 0 && unitesSur(etat, n, autre).length === 0);
}

/** Une carte est visible de tous si elle est face visible dans une zone publique. */
function estPublique(etat: EtatTable, idCarte: string, zone: string | null): boolean {
  const carte = etat.cartes[idCarte];
  const info = zone ? lireZone(zone) : null;
  return Boolean(carte && info && !ZONES_CACHEES.has(info.zone) && carte.face);
}

// ---------- Actions ----------

/** Actions validées par le schéma zod de schema-action.ts (séparé : le tutoriel du navigateur réutilise ce moteur sans zod). */
export type ActionTable = z.infer<typeof schemaAction>;

export type ResultatAction = { ok: true } | { ok: false; erreur: string };

const NOMS_ZONES: Record<string, string> = {
  main: "sa main",
  deck: "son deck",
  runes: "son deck de runes",
  reserve: "sa réserve de runes",
  base: "sa base",
  defausse: "sa défausse",
  bannis: "ses cartes bannies",
  legende: "sa zone de Légende",
  champion: "sa zone de champion",
  terrains: "ses champs de bataille disponibles",
};
const nomZone = (id: string) => {
  const info = lireZone(id);
  if (!info) return id;
  return info.zone === "champ" ? `le champ de bataille ${Number(id.slice(6)) + 1}` : (NOMS_ZONES[info.zone] ?? info.zone);
};

/**
 * Applique l'action d'un joueur. Modifie l'état en place (le Durable Object l'enregistre ensuite).
 * Droits : je manipule mes cartes partout ; les cartes de l'adversaire seulement si elles sont visibles en jeu
 * (pour les incliner, y poser un marqueur, les détruire vers SA défausse…), et toujours vers SES zones à lui.
 */
export function appliquerAction(etat: EtatTable, j: IndexJoueur, action: ActionTable, aleatoire: Aleatoire, t: number): ResultatAction {
  const moi = etat.joueurs[j].pseudo;
  const carteManipulable = (id: string): { carte: CarteJeu; zone: string } | null => {
    const carte = etat.cartes[id];
    const zone = carte ? zoneDe(etat, id) : null;
    if (!carte || !zone) return null;
    if (carte.proprio === j || estPublique(etat, id, zone)) return { carte, zone };
    return null;
  };

  switch (action.type) {
    case "piocher": {
      const n = deplacerDessus(etat, j, "deck", "main", action.n);
      if (n === 0) return { ok: false, erreur: "deck_vide" };
      journaliser(etat, j, `${moi} pioche ${n} carte${n > 1 ? "s" : ""}.`, t);
      break;
    }
    case "canaliser": {
      const avant = etat.zones[idZone(j, "reserve")]?.length ?? 0;
      const n = deplacerDessus(etat, j, "runes", "reserve", action.n);
      if (n === 0) return { ok: false, erreur: "runes_vides" };
      const nouvelles = etat.zones[idZone(j, "reserve")]?.slice(avant) ?? [];
      journaliser(etat, j, `${moi} canalise ${nouvelles.map((_, i) => `{${i}}`).join(", ")}.`, t, nouvelles.map((id) => etat.cartes[id]?.code ?? ""));
      break;
    }
    case "melanger": {
      const zone = idZone(j, action.zone);
      etat.zones[zone] = melanger(etat.zones[zone] ?? [], aleatoire);
      journaliser(etat, j, `${moi} mélange ${nomZone(zone)}.`, t);
      break;
    }
    case "debutTour": {
      // Aide automatique : Réveil (tout redresser), tenir (1 point par champ contrôlé), canaliser 2 runes (3 au premier
      // tour du second joueur), piocher 1 carte.
      const tours = (etat.tours ??= [0, 0]);
      const premierTour = tours[j] === 0;
      tours[j] += 1;
      for (const carte of Object.values(etat.cartes)) if (carte.proprio === j) carte.inclinee = false;
      const tenus = champsControles(etat, j);
      const joueur = etat.joueurs[j];
      joueur.points = Math.min(99, joueur.points + tenus.length);
      const runes = deplacerDessus(etat, j, "runes", "reserve", premierTour && j !== etat.premier ? 3 : 2);
      const pioche = deplacerDessus(etat, j, "deck", "main", 1);
      const morceaux = [
        "redresse tout",
        ...(tenus.length ? [`tient ${tenus.map((n) => `le champ de bataille ${n + 1}`).join(" et ")} (+${tenus.length} point${tenus.length > 1 ? "s" : ""})`] : []),
        `canalise ${runes} rune${runes > 1 ? "s" : ""}`,
        pioche ? "pioche 1 carte" : "ne peut plus piocher",
      ];
      journaliser(etat, j, `${moi} commence son tour ${tours[j]} : ${morceaux.join(", ")}.`, t);
      break;
    }
    case "jouer": {
      // Aide automatique : le client a choisi les runes qui paient ; on incline, on recycle, puis on pose la carte.
      const carte = etat.cartes[action.carte];
      const depart = carte ? zoneDe(etat, carte.id) : null;
      if (!carte || carte.proprio !== j || (depart !== idZone(j, "main") && depart !== idZone(j, "champion"))) {
        return { ok: false, erreur: "carte_interdite" };
      }
      const arrivee = lireZone(action.vers);
      const versOk = action.vers === idZone(j, "base") || action.vers === idZone(j, "defausse") || arrivee?.zone === "champ";
      if (!arrivee || !versOk) return { ok: false, erreur: "zone_interdite" };
      const reserve = etat.zones[idZone(j, "reserve")] ?? [];
      const tous = [...action.payer.incliner, ...action.payer.recycler];
      const valide =
        new Set(action.payer.incliner).size === action.payer.incliner.length &&
        new Set(action.payer.recycler).size === action.payer.recycler.length &&
        tous.every((id) => reserve.includes(id)) &&
        action.payer.incliner.every((id) => !etat.cartes[id]?.inclinee);
      if (!valide) return { ok: false, erreur: "paiement_invalide" };
      for (const id of action.payer.incliner) {
        const rune = etat.cartes[id];
        if (rune) rune.inclinee = true;
      }
      for (const id of action.payer.recycler) {
        const rune = etat.cartes[id];
        if (!rune) continue;
        reserve.splice(reserve.indexOf(id), 1);
        rune.inclinee = false;
        rune.face = false;
        etat.zones[idZone(j, "runes")]?.push(id);
      }
      const source = etat.zones[depart] ?? [];
      source.splice(source.indexOf(carte.id), 1);
      (etat.zones[action.vers] ??= []).push(carte.id);
      carte.face = true;
      carte.inclinee = Boolean(action.inclinee) && action.vers !== idZone(j, "defausse");
      const prix = [
        ...(action.payer.incliner.length ? [`${action.payer.incliner.length} énergie`] : []),
        ...(action.payer.recycler.length ? [`${action.payer.recycler.length} puissance`] : []),
      ];
      const quoi = action.vers === idZone(j, "defausse") ? "lance {0}" : `joue {0} vers ${nomZone(action.vers)}`;
      journaliser(etat, j, `${moi} ${quoi}${prix.length ? ` (paie ${prix.join(" + ")})` : ""}.`, t, [carte.code]);
      break;
    }
    case "bouger": {
      // Aide automatique : une unité se déplace entre sa base et un champ de bataille en s'inclinant ; arriver sur un
      // champ vide le conquiert (+1 point), arriver sur un champ occupé par l'adversaire déclenche un combat.
      const carte = etat.cartes[action.carte];
      const depart = carte ? zoneDe(etat, carte.id) : null;
      const base = idZone(j, "base");
      if (!carte || carte.proprio !== j || carte.terrain || (depart !== base && lireZone(depart ?? "")?.zone !== "champ")) {
        return { ok: false, erreur: "carte_interdite" };
      }
      if (action.vers === depart || (action.vers !== base && lireZone(action.vers)?.zone !== "champ")) return { ok: false, erreur: "zone_interdite" };
      if (carte.inclinee) return { ok: false, erreur: "unite_inclinee" };
      const n = action.vers === base ? -1 : Number(action.vers.slice(6));
      const adverses = n >= 0 ? unitesSur(etat, n, (1 - j) as IndexJoueur).length : 0;
      const amies = n >= 0 ? unitesSur(etat, n, j).length : 0;
      const source = etat.zones[depart ?? ""] ?? [];
      source.splice(source.indexOf(carte.id), 1);
      (etat.zones[action.vers] ??= []).push(carte.id);
      carte.inclinee = true;
      const visible = carte.face ? "{0}" : "une carte cachée";
      const cartes = carte.face ? [carte.code] : undefined;
      if (n < 0) journaliser(etat, j, `${moi} ramène ${visible} dans sa base.`, t, cartes);
      else if (adverses > 0) journaliser(etat, j, `${moi} envoie ${visible} au champ de bataille ${n + 1} : combat !`, t, cartes);
      else if (amies > 0) journaliser(etat, j, `${moi} envoie ${visible} au champ de bataille ${n + 1}.`, t, cartes);
      else {
        // Conquête. Le 8e point ne vient jamais d'une conquête : on pioche 1 carte à la place (règle simplifiée).
        const joueur = etat.joueurs[j];
        if (joueur.points >= 7) {
          deplacerDessus(etat, j, "deck", "main", 1);
          journaliser(etat, j, `${moi} conquiert le champ de bataille ${n + 1} avec ${visible} : pas de 8e point par une conquête, il pioche 1 carte.`, t, cartes);
        } else {
          joueur.points += 1;
          journaliser(etat, j, `${moi} conquiert le champ de bataille ${n + 1} avec ${visible} (+1 point).`, t, cartes);
        }
      }
      break;
    }
    case "deplacer": {
      const prise = carteManipulable(action.carte);
      if (!prise) return { ok: false, erreur: "carte_interdite" };
      const { carte, zone: depart } = prise;
      const arrivee = lireZone(action.vers);
      if (!arrivee) return { ok: false, erreur: "zone_inconnue" };
      // On ne pose jamais une carte dans les zones de l'autre joueur (sauf les champs de bataille, communs).
      if (arrivee.proprio !== null && arrivee.proprio !== carte.proprio) return { ok: false, erreur: "zone_interdite" };
      const etaitPublique = estPublique(etat, carte.id, depart);
      const source = etat.zones[depart] ?? [];
      source.splice(source.indexOf(carte.id), 1);
      const cible = etat.zones[action.vers] ?? [];
      const cachee = ZONES_CACHEES.has(arrivee.zone);
      if (action.position === "dessous" || !cachee) cible.push(carte.id);
      else cible.unshift(carte.id);
      etat.zones[action.vers] = cible;
      carte.face = cachee ? false : !(action.cachee && carte.proprio === j && ZONES_EN_JEU.has(arrivee.zone));
      if (!ZONES_EN_JEU.has(arrivee.zone)) {
        carte.inclinee = false;
        carte.marqueurs = 0;
        // Un token qui quitte le jeu cesse d'exister.
        if (carte.token) {
          cible.splice(cible.indexOf(carte.id), 1);
          delete etat.cartes[carte.id];
          journaliser(etat, j, carte.libelle ? `${moi} retire le token ${carte.libelle}.` : `${moi} retire le token {0}.`, t, carte.libelle ? undefined : [carte.code]);
          break;
        }
      }
      const devientPublique = estPublique(etat, carte.id, action.vers);
      const qui = carte.proprio === j ? moi : `${moi} (carte de ${etat.joueurs[carte.proprio].pseudo})`;
      const ou = arrivee.zone === "deck" || arrivee.zone === "runes" ? `${action.position === "dessous" ? "sous" : "sur"} ${nomZone(action.vers)}` : `vers ${nomZone(action.vers)}`;
      if (etaitPublique || devientPublique) journaliser(etat, j, `${qui} déplace {0} ${ou}.`, t, [carte.code]);
      else journaliser(etat, j, `${qui} déplace une carte cachée de ${nomZone(depart)} ${ou}.`, t);
      break;
    }
    case "incliner": {
      const prise = carteManipulable(action.carte);
      if (!prise) return { ok: false, erreur: "carte_interdite" };
      prise.carte.inclinee = !prise.carte.inclinee;
      const public_ = estPublique(etat, prise.carte.id, prise.zone);
      journaliser(etat, j, `${moi} ${prise.carte.inclinee ? "incline" : "redresse"} ${public_ ? "{0}" : "une carte cachée"}.`, t, public_ ? [prise.carte.code] : undefined);
      break;
    }
    case "retourner": {
      const carte = etat.cartes[action.carte];
      const zone = carte ? zoneDe(etat, carte.id) : null;
      const info = zone ? lireZone(zone) : null;
      if (!carte || carte.proprio !== j || !info || !ZONES_EN_JEU.has(info.zone)) return { ok: false, erreur: "carte_interdite" };
      carte.face = !carte.face;
      journaliser(etat, j, carte.face ? `${moi} retourne face visible {0}.` : `${moi} retourne une carte face cachée.`, t, carte.face ? [carte.code] : undefined);
      break;
    }
    case "marqueur": {
      const prise = carteManipulable(action.carte);
      if (!prise) return { ok: false, erreur: "carte_interdite" };
      prise.carte.marqueurs = Math.max(-99, Math.min(99, prise.carte.marqueurs + action.delta));
      journaliser(etat, j, `${moi} met ${prise.carte.marqueurs} marqueur${Math.abs(prise.carte.marqueurs) > 1 ? "s" : ""} sur {0}.`, t, [prise.carte.code]);
      break;
    }
    case "redresser": {
      for (const carte of Object.values(etat.cartes)) if (carte.proprio === j) carte.inclinee = false;
      journaliser(etat, j, `${moi} redresse toutes ses cartes.`, t);
      break;
    }
    case "points": {
      const joueur = etat.joueurs[j];
      joueur.points = Math.max(0, Math.min(99, joueur.points + action.delta));
      journaliser(etat, j, `${moi} passe à ${joueur.points} point${joueur.points > 1 ? "s" : ""}.`, t);
      break;
    }
    case "reveler": {
      const carte = etat.cartes[action.carte];
      if (!carte || carte.proprio !== j || zoneDe(etat, carte.id) !== idZone(j, "main")) return { ok: false, erreur: "carte_interdite" };
      journaliser(etat, j, `${moi} révèle {0} de sa main.`, t, [carte.code]);
      break;
    }
    case "mulligan": {
      if (etat.mulliganFait[j]) return { ok: false, erreur: "mulligan_deja_fait" };
      const main = etat.zones[idZone(j, "main")] ?? [];
      if (new Set(action.cartes).size !== action.cartes.length || !action.cartes.every((id) => main.includes(id))) {
        return { ok: false, erreur: "carte_interdite" };
      }
      // Riftbound : on met de côté jusqu'à 2 cartes, on en pioche autant, puis elles vont sous le deck.
      etat.zones[idZone(j, "main")] = main.filter((id) => !action.cartes.includes(id));
      deplacerDessus(etat, j, "deck", "main", action.cartes.length);
      for (const id of action.cartes) {
        const carte = etat.cartes[id];
        if (carte) carte.face = false;
        etat.zones[idZone(j, "deck")]?.push(id);
      }
      etat.mulliganFait[j] = true;
      journaliser(etat, j, `${moi} garde sa main${action.cartes.length ? ` après avoir changé ${action.cartes.length} carte${action.cartes.length > 1 ? "s" : ""}` : ""}.`, t);
      break;
    }
    case "creerToken": {
      const arrivee = lireZone(action.vers);
      if (!arrivee || !ZONES_EN_JEU.has(arrivee.zone) || (arrivee.proprio !== null && arrivee.proprio !== j)) {
        return { ok: false, erreur: "zone_interdite" };
      }
      if (Boolean(action.code) === Boolean(action.libelle)) return { ok: false, erreur: "token_inconnu" };
      if (action.code && !(etat.tokens ?? []).includes(action.code)) return { ok: false, erreur: "token_inconnu" };
      let suivant = Math.max(0, ...Object.keys(etat.cartes).map((id) => Number(id.slice(1)) || 0));
      if (suivant + action.n > 9999) return { ok: false, erreur: "trop_de_cartes" };
      for (let i = 0; i < action.n; i++) {
        const id = `c${++suivant}`;
        etat.cartes[id] = {
          id,
          code: action.code ?? "",
          proprio: j,
          face: true,
          inclinee: false,
          marqueurs: 0,
          token: true,
          ...(action.libelle ? { libelle: action.libelle } : {}),
        };
        (etat.zones[action.vers] ??= []).push(id);
      }
      const quoi = action.libelle ? `${action.n} token${action.n > 1 ? "s" : ""} ${action.libelle}` : `${action.n} × {0}`;
      journaliser(etat, j, `${moi} crée ${quoi} (${nomZone(action.vers)}).`, t, action.code ? [action.code] : undefined);
      break;
    }
    case "de": {
      journaliser(etat, j, `${moi} lance un dé : ${1 + Math.floor(aleatoire() * 6)}.`, t);
      break;
    }
    case "dire": {
      journaliser(etat, j, `${moi} : ${action.texte}`, t);
      break;
    }
  }
  etat.version++;
  return { ok: true };
}

// ---------- Vue d'un joueur ----------

export interface CarteVue {
  id: string;
  /** null : face cachée pour moi. */
  code: string | null;
  proprio: IndexJoueur;
  face: boolean;
  inclinee: boolean;
  marqueurs: number;
  token?: true;
  libelle?: string;
}

export interface VueTable {
  code: string;
  moi: IndexJoueur | null;
  joueurs: [JoueurTable, JoueurTable];
  premier: IndexJoueur;
  /** Zones visibles : les cartes ; zones cachées : seulement leur nombre. */
  zones: Record<string, CarteVue[] | number>;
  journal: EntreeJournal[];
  mulliganFait: [boolean, boolean];
  /** Tokens du jeu que l'on peut créer. */
  tokens: string[];
  version: number;
}

/** Ce que voit un joueur (ou un spectateur, `moi = null`) : jamais la main de l'autre ni l'ordre des decks. */
export function vuePour(etat: EtatTable, moi: IndexJoueur | null): VueTable {
  const zones: VueTable["zones"] = {};
  for (const [id, ids] of Object.entries(etat.zones)) {
    const info = lireZone(id);
    if (!info) continue;
    const maMain = info.zone === "main" && info.proprio === moi;
    if (ZONES_CACHEES.has(info.zone) && !maMain) {
      zones[id] = ids.length;
      continue;
    }
    zones[id] = ids.flatMap((cid) => {
      const c = etat.cartes[cid];
      if (!c) return [];
      const visible = c.face || c.proprio === moi;
      return [
        {
          id: c.id,
          code: visible && c.code ? c.code : null,
          proprio: c.proprio,
          face: c.face,
          inclinee: c.inclinee,
          marqueurs: c.marqueurs,
          ...(c.token ? { token: true as const } : {}),
          ...(c.libelle && visible ? { libelle: c.libelle } : {}),
        },
      ];
    });
  }
  return {
    code: etat.code,
    moi,
    joueurs: etat.joueurs,
    premier: etat.premier,
    zones,
    journal: etat.journal,
    mulliganFait: etat.mulliganFait,
    tokens: etat.tokens ?? [],
    version: etat.version,
  };
}
