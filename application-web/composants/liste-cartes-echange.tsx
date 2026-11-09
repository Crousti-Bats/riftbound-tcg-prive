/** Petite liste de cartes d'un échange (miniatures + quantité + foil). Optionnellement modifiable (panier). */
import { ImageCarte } from "./image-carte";
import { classeRarete, type Carte } from "../outils/libelles-cartes";

export interface ElementListe {
  cle: string;
  carte: Carte | null;
  code: string;
  foil: boolean;
  quantite: number;
}

interface Props {
  elements: ElementListe[];
  vide: string;
  /** Si fourni : boutons − / + pour modifier les quantités (panier). */
  surChangement?: (cle: string, delta: number) => void;
  /** Quantité maximale par élément (panier). */
  maxParCle?: Map<string, number>;
}

export function ListeCartesEchange({ elements, vide, surChangement, maxParCle }: Props) {
  if (elements.length === 0) return <p className="aide">{vide}</p>;
  return (
    <ul className="liste-echange">
      {elements.map((e) => (
        <li key={e.cle} className={`ligne-echange ${e.carte ? classeRarete(e.carte) : ""}`}>
          {e.carte ? (
            <ImageCarte
              className={`miniature ${e.carte.orientation === "paysage" ? "miniature-paysage" : ""}`}
              image={e.carte.image}
              largeur={300}
              alt={e.carte.nom}
              paresseuse
            />
          ) : (
            <span className="miniature miniature-vide" />
          )}
          <span className="nom-ligne">
            {e.carte?.nom ?? e.code}
            {e.foil && <span title="Foil"> ✨</span>}
          </span>
          {surChangement ? (
            <span className="quantite-ligne">
              <button className="petit secondaire" onClick={() => surChangement(e.cle, -1)} aria-label="Retirer un exemplaire">
                −
              </button>
              <strong>×{e.quantite}</strong>
              <button
                className="petit secondaire"
                disabled={e.quantite >= (maxParCle?.get(e.cle) ?? 99)}
                onClick={() => surChangement(e.cle, +1)}
                aria-label="Ajouter un exemplaire"
              >
                +
              </button>
            </span>
          ) : (
            <strong className="quantite-ligne">×{e.quantite}</strong>
          )}
        </li>
      ))}
    </ul>
  );
}
