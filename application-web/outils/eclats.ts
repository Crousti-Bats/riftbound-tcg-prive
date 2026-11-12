/**
 * Mon solde d'éclats côté navigateur : chargé une fois puis tenu à jour après chaque recyclage, achat ou fabrication,
 * partagé par la collection, les fiches de carte et le panneau des boosters.
 */
import { useSyncExternalStore } from "react";
import { appelerApi } from "./appels-api";
import type { Carte } from "./libelles-cartes";

/** Catégories de recyclage (mêmes codes que le serveur), de la moins à la plus précieuse. */
export const CATEGORIES_ECLATS = [
  { code: "commune", libelle: "Communes" },
  { code: "peu-commune", libelle: "Peu communes" },
  { code: "rare", libelle: "Rares" },
  { code: "epique", libelle: "Épiques" },
  { code: "alt", libelle: "Alt Art" },
  { code: "overnumbered", libelle: "Overnumbered" },
  { code: "signee", libelle: "Signées" },
  { code: "special", libelle: "Special et Ultime" },
] as const;

export interface DoublonVue extends Carte {
  categorie: string | null;
  doublons: { normale: number; foil: number };
  /** Éclats rapportés par un exemplaire normal et par une foil. */
  valeur: { normale: number; foil: number };
  eclats: number;
}
export interface EtatEclats {
  solde: number;
  prixBooster: number;
  doublons: { exemplaires: number; eclats: number; cartes: DoublonVue[] };
}

let solde: number | null = null;
let prixBooster: number | null = null;
let chargement: Promise<unknown> | null = null;
const abonnes = new Set<() => void>();

export function publierSolde(suivant: number) {
  solde = suivant;
  abonnes.forEach((f) => f());
}

/** Relit le solde et la liste de mes doublons recyclables. */
export function chargerEclats(): Promise<EtatEclats> {
  const requete = appelerApi<EtatEclats>("GET", "/eclats").then((r) => {
    prixBooster = r.prixBooster;
    publierSolde(r.solde);
    return r;
  });
  chargement = requete.catch(() => {
    chargement = null;
  });
  return requete;
}

function sAbonner(f: () => void) {
  abonnes.add(f);
  if (!chargement) void chargerEclats().catch(() => undefined);
  return () => abonnes.delete(f);
}

/** Mon solde d'éclats, mis à jour en direct (null pendant le premier chargement). */
export function useSoldeEclats(): number | null {
  return useSyncExternalStore(sAbonner, () => solde);
}

/** Prix d'un booster en éclats (fixé par le serveur ; null avant le premier chargement). */
export function usePrixBooster(): number | null {
  return useSyncExternalStore(sAbonner, () => prixBooster);
}

export const formaterEclats = (n: number) => `${n.toLocaleString("fr-FR")} 💎`;
