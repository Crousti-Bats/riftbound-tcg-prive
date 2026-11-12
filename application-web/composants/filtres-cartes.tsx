/** Barre de filtres de cartes (set, type, rareté, variante, recherche), partagée catalogue/collection. */
import type { ReactNode } from "react";
import { LIBELLES_RARETE, LIBELLES_TYPE, LIBELLES_VARIANTE, type SetInfo } from "../outils/libelles-cartes";

interface Props {
  sets: SetInfo[];
  recherche: string;
  surRecherche: (valeur: string) => void;
  set: string;
  surSet: (valeur: string) => void;
  type: string;
  surType: (valeur: string) => void;
  rarete: string;
  surRarete: (valeur: string) => void;
  variante: string;
  surVariante: (valeur: string) => void;
  /** Ordre d'affichage : "" (par set et numéro), "rarete-desc", "rarete-asc", ou par quantité (voir triQuantite). */
  tri?: string;
  surTri?: (valeur: string) => void;
  /** Propose aussi le tri par nombre d'exemplaires (cartes possédées seulement). */
  triQuantite?: boolean;
  /** Filtres supplémentaires (ex. bascules foil/doublons de la collection). */
  children?: ReactNode;
}

export function FiltresCartes(props: Props) {
  return (
    <section className="carte filtres">
      <label>
        Recherche
        <input
          type="search"
          value={props.recherche}
          onChange={(e) => props.surRecherche(e.target.value)}
          placeholder="ex. Jinx, Fury, Spell…"
          maxLength={50}
        />
      </label>
      <label>
        Set
        <select value={props.set} onChange={(e) => props.surSet(e.target.value)}>
          <option value="">Tous les sets</option>
          {props.sets.map((s) => (
            <option key={s.code} value={s.code}>
              {s.nom} ({s.nbCartes})
            </option>
          ))}
        </select>
      </label>
      <label>
        Type
        <select value={props.type} onChange={(e) => props.surType(e.target.value)}>
          <option value="">Tous les types</option>
          {Object.entries(LIBELLES_TYPE).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        Rareté
        <select value={props.rarete} onChange={(e) => props.surRarete(e.target.value)}>
          <option value="">Toutes</option>
          {Object.entries(LIBELLES_RARETE).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        Variante
        <select value={props.variante} onChange={(e) => props.surVariante(e.target.value)}>
          <option value="">Toutes</option>
          {Object.entries(LIBELLES_VARIANTE).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {props.surTri && (
        <label>
          Trier par
          <select value={props.tri ?? ""} onChange={(e) => props.surTri?.(e.target.value)}>
            <option value="">Set et numéro (défaut)</option>
            <option value="rarete-desc">Plus rares d'abord</option>
            <option value="rarete-asc">Plus communes d'abord</option>
            {props.triQuantite && <option value="quantite-desc">Plus d'exemplaires d'abord</option>}
            {props.triQuantite && <option value="quantite-asc">Moins d'exemplaires d'abord</option>}
          </select>
        </label>
      )}
      {props.children}
    </section>
  );
}
