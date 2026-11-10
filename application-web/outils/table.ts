/** Table de jeu côté navigateur : types de la vue envoyée par la salle, connexion WebSocket, cache des cartes. */
import { useCallback, useEffect, useRef, useState } from "react";
import { appelerApi } from "./appels-api";
import type { Carte } from "./libelles-cartes";

export type IndexJoueur = 0 | 1;

export interface CarteVue {
  id: string;
  code: string | null;
  proprio: IndexJoueur;
  face: boolean;
  inclinee: boolean;
  marqueurs: number;
  /** Token créé pendant la partie (disparaît en quittant le jeu). */
  token?: true;
  /** Token libre (absent des données) : son nom. */
  libelle?: string;
}

export interface EntreeJournal {
  t: number;
  j: IndexJoueur | null;
  texte: string;
  cartes?: string[];
}

export interface VueTable {
  code: string;
  moi: IndexJoueur | null;
  joueurs: [{ id: number; pseudo: string; points: number }, { id: number; pseudo: string; points: number }];
  premier: IndexJoueur;
  zones: Record<string, CarteVue[] | number>;
  journal: EntreeJournal[];
  mulliganFait: [boolean, boolean];
  /** Tokens du jeu que l'on peut créer. */
  tokens: string[];
  version: number;
}

export type ActionTable =
  | { type: "piocher"; n: number }
  | { type: "canaliser"; n: number }
  | { type: "melanger"; zone: "deck" | "runes" }
  | { type: "deplacer"; carte: string; vers: string; position?: "dessus" | "dessous"; cachee?: boolean }
  | { type: "incliner"; carte: string }
  | { type: "retourner"; carte: string }
  | { type: "marqueur"; carte: string; delta: number }
  | { type: "redresser" }
  | { type: "points"; delta: number }
  | { type: "reveler"; carte: string }
  | { type: "mulligan"; cartes: string[] }
  | { type: "creerToken"; code?: string; libelle?: string; vers: string; n: number }
  | { type: "de" }
  | { type: "dire"; texte: string };

export interface InfoPartie {
  code: string;
  statut: "attente" | "en_cours" | "terminee";
  creeLe: number;
  createur: string;
  invite: string | null;
  moi: IndexJoueur | null;
}

export const MESSAGES_TABLE: Record<string, string> = {
  deck_vide: "Ton deck est vide.",
  runes_vides: "Ton deck de runes est vide.",
  carte_interdite: "Tu ne peux pas faire ça avec cette carte.",
  zone_interdite: "Une carte va toujours dans les zones de son propriétaire.",
  zone_inconnue: "Zone inconnue.",
  mulligan_deja_fait: "Tu as déjà fait ton mulligan.",
  trop_rapide: "Doucement ! Trop d'actions d'affilée.",
  action_invalide: "Action refusée.",
  token_inconnu: "Ce token n'existe pas.",
  trop_de_cartes: "Trop de cartes sur la table.",
};

/** Cartes d'une zone (tableau vide pour une zone cachée, dont on ne connaît que le nombre). */
export const cartesZone = (vue: VueTable, zone: string): CarteVue[] => {
  const z = vue.zones[zone];
  return Array.isArray(z) ? z : [];
};
/** Nombre de cartes d'une zone, cachée ou non. */
export const nombreZone = (vue: VueTable, zone: string): number => {
  const z = vue.zones[zone];
  return Array.isArray(z) ? z.length : (z ?? 0);
};

export type EtatConnexion = "connexion" | "connecte" | "deconnecte" | "terminee";

/**
 * Connexion à la salle : reçoit la vue à chaque action, se reconnecte toute seule (1 s, 2 s, 4 s… 15 s au plus),
 * et ignore une vue plus ancienne que celle déjà affichée.
 */
export function useSalle(code: string, actif: boolean) {
  const [vue, setVue] = useState<VueTable | null>(null);
  const [etat, setEtat] = useState<EtatConnexion>("connexion");
  const [erreur, setErreur] = useState<string | null>(null);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!actif) return;
    let arrete = false;
    let essai = 0;
    let minuteur: number | undefined;
    const ouvrir = () => {
      setEtat("connexion");
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/parties/${code}/ws`);
      socket.current = ws;
      ws.onopen = () => {
        essai = 0;
        setEtat("connecte");
      };
      ws.onmessage = (e) => {
        let message: { type: string; vue?: VueTable; erreur?: string };
        try {
          message = JSON.parse(String(e.data)) as typeof message;
        } catch {
          return;
        }
        if (message.type === "vue" && message.vue) {
          const nouvelle = message.vue;
          setVue((precedente) => (precedente && precedente.version > nouvelle.version ? precedente : nouvelle));
        } else if (message.type === "erreur") {
          setErreur(MESSAGES_TABLE[message.erreur ?? ""] ?? "Action refusée.");
        } else if (message.type === "fin") {
          arrete = true;
          setEtat("terminee");
        }
      };
      ws.onclose = () => {
        // Une ancienne connexion qui se ferme en retard ne doit pas effacer la nouvelle.
        if (socket.current === ws) socket.current = null;
        if (arrete) return;
        setEtat("deconnecte");
        minuteur = window.setTimeout(ouvrir, Math.min(15_000, 1000 * 2 ** essai++));
      };
    };
    ouvrir();
    return () => {
      arrete = true;
      window.clearTimeout(minuteur);
      const ws = socket.current;
      socket.current = null;
      ws?.close();
    };
  }, [code, actif]);

  const envoyer = useCallback((action: ActionTable) => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      setErreur("Connexion perdue : reconnexion en cours…");
      return;
    }
    setErreur(null);
    socket.current.send(JSON.stringify({ type: "action", action }));
  }, []);

  return { vue, etat, erreur, effacerErreur: () => setErreur(null), envoyer };
}

/** Données des cartes visibles sur la table, chargées par lots de 100 et gardées en mémoire. */
export function useCartesTable(vue: VueTable | null): Record<string, Carte> {
  const [cartes, setCartes] = useState<Record<string, Carte>>({});
  const demandees = useRef(new Set<string>());

  useEffect(() => {
    if (!vue) return;
    const codes = new Set<string>();
    for (const z of Object.values(vue.zones)) if (Array.isArray(z)) for (const c of z) if (c.code) codes.add(c.code);
    for (const e of vue.journal) for (const code of e.cartes ?? []) codes.add(code);
    for (const code of vue.tokens ?? []) codes.add(code);
    const manquants = [...codes].filter((code) => !demandees.current.has(code));
    if (manquants.length === 0) return;
    manquants.forEach((code) => demandees.current.add(code));
    for (let i = 0; i < manquants.length; i += 100) {
      const lot = manquants.slice(i, i + 100);
      appelerApi<{ cartes: Carte[] }>("GET", `/catalogue/lot?codes=${lot.join(",")}`).then(
        (r) => setCartes((prev) => ({ ...prev, ...Object.fromEntries(r.cartes.map((c) => [c.code, c])) })),
        () => lot.forEach((code) => demandees.current.delete(code)),
      );
    }
  }, [vue]);

  return cartes;
}

/** Texte du journal avec le nom des cartes à la place de {0}, {1}… */
export function texteJournal(entree: EntreeJournal, cartes: Record<string, Carte>): string {
  return entree.texte.replace(/\{(\d+)\}/g, (_, i: string) => {
    const code = entree.cartes?.[Number(i)];
    const carte = code ? cartes[code] : undefined;
    return carte ? (carte.sousTitre ? `${carte.nom}, ${carte.sousTitre}` : carte.nom) : "une carte";
  });
}
