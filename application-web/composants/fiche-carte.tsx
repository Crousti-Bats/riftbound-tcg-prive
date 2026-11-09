/** Fiche détaillée d'une carte, en fenêtre modale. Partagée par le catalogue, la collection et l'ouverture. */
import { ImageCarte } from "./image-carte";
import { useEffect } from "react";
import { type Carte, classeRarete, LIBELLES_RARETE, LIBELLES_VARIANTE } from "../outils/libelles-cartes";

interface Props {
  carte: Carte;
  nomSet: string;
  surFermeture: () => void;
  /** Possession à afficher (page Collection). */
  possession?: { quantite: number; quantiteFoil: number };
  /** Carte obtenue en foil (ouverture de booster). */
  foil?: boolean;
}

export function FicheCarte({ carte, nomSet, surFermeture, possession, foil }: Props) {
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === "Escape" && surFermeture();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [surFermeture]);

  return (
    <div className="fond-modale" onClick={surFermeture} role="presentation">
      <div
        className={`modale ${carte.orientation === "paysage" ? "modale-paysage" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={carte.nom}
        onClick={(e) => e.stopPropagation()}
      >
        <ImageCarte
          className={`image-fiche ${classeRarete(carte)}`}
          image={carte.image}
          largeur={carte.orientation === "paysage" ? 1039 : 744}
          alt={carte.nom}
        />
        <div className="details-fiche">
          <h2>
            {carte.nom}
            {carte.sousTitre ? `, ${carte.sousTitre}` : ""}
          </h2>
          <p className="aide">
            {nomSet} · n° {carte.numero}
          </p>
          {(possession || foil) && (
            <p className="aide">
              {possession ? `Tu en possèdes ${possession.quantite} normale(s)` : ""}
              {possession && possession.quantiteFoil > 0 ? ` et ${possession.quantiteFoil} foil ✨` : ""}
              {foil ? "Version foil ✨" : ""}
            </p>
          )}
          <dl>
            <dt>Rareté</dt>
            <dd>{LIBELLES_RARETE[carte.rarete] ?? carte.rarete}</dd>
            <dt>Variante</dt>
            <dd>{LIBELLES_VARIANTE[carte.variante] ?? carte.variante}</dd>
            <dt>Type</dt>
            <dd>{[carte.type, ...carte.etiquettes].join(" · ")}</dd>
            {carte.domaines.length > 0 && (
              <>
                <dt>Domaine</dt>
                <dd>{carte.domaines.join(", ")}</dd>
              </>
            )}
            {carte.energie !== null && (
              <>
                <dt>Énergie</dt>
                <dd>{carte.energie}</dd>
              </>
            )}
            {carte.puissance !== null && (
              <>
                <dt>Puissance</dt>
                <dd>{carte.puissance}</dd>
              </>
            )}
            {carte.force !== null && (
              <>
                <dt>Might</dt>
                <dd>{carte.force}</dd>
              </>
            )}
            {carte.artiste && (
              <>
                <dt>Artiste</dt>
                <dd>{carte.artiste}</dd>
              </>
            )}
          </dl>
          {carte.texte && <p className="texte-carte">{carte.texte}</p>}
          <button onClick={surFermeture}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
