/**
 * Ma wishlist côté navigateur : la liste des cardCode, chargée une fois puis tenue à jour,
 * partagée par toutes les fiches de carte (bouton ♡) et par l'aperçu des boosters.
 */
import { useSyncExternalStore } from "react";
import { appelerApi } from "./appels-api";
import type { Carte } from "./libelles-cartes";

export interface SouhaitVue {
  carte: Carte;
  ajouteeLe: number;
  /** Exemplaires déjà possédés (normaux + foil) : une carte obtenue n'apparaît plus au marché. */
  possedee: number;
}

let codes: ReadonlySet<string> = new Set();
let chargement: Promise<void> | null = null;
const abonnes = new Set<() => void>();

function publier(suivants: ReadonlySet<string>) {
  codes = suivants;
  abonnes.forEach((f) => f());
}

/** Relit ma wishlist depuis le serveur (au premier usage, puis après chaque changement fait ailleurs). */
export function rechargerWishlist(): Promise<SouhaitVue[]> {
  const requete = appelerApi<{ cartes: SouhaitVue[] }>("GET", "/wishlist").then((r) => {
    publier(new Set(r.cartes.map((s) => s.carte.code)));
    return r.cartes;
  });
  chargement = requete.then(
    () => undefined,
    () => {
      chargement = null; // nouvel essai au prochain usage
    },
  );
  return requete;
}

function sAbonner(f: () => void) {
  abonnes.add(f);
  if (!chargement) void rechargerWishlist().catch(() => undefined);
  return () => abonnes.delete(f);
}

/** Codes de ma wishlist, mis à jour en direct. */
export function useWishlist(): ReadonlySet<string> {
  return useSyncExternalStore(sAbonner, () => codes);
}

/** Ajoute ou retire une carte (mise à jour immédiate de l'affichage, annulée si le serveur refuse). */
export async function basculerWishlist(code: string): Promise<void> {
  const avant = codes;
  const present = avant.has(code);
  const suivants = new Set(avant);
  if (present) suivants.delete(code);
  else suivants.add(code);
  publier(suivants);
  try {
    if (present) await appelerApi("DELETE", `/wishlist/${encodeURIComponent(code)}`);
    else await appelerApi("POST", "/wishlist", { code });
  } catch (e) {
    publier(avant);
    throw e;
  }
}
