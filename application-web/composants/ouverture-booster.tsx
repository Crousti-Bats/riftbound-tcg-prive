/** Overlay d'ouverture d'un booster : les 14 cartes apparaissent en cascade, halo sur les rares+ et voile foil. */
import { useState } from "react";
import { FicheCarte } from "./fiche-carte";
import { type CarteOuverte, classeRarete, estRarePlus, urlImage } from "../outils/libelles-cartes";
import { naviguer } from "../outils/navigation";

interface Props {
  cartes: CarteOuverte[];
  sets: Array<{ code: string; nom: string }>;
  peutOuvrirAutre: boolean;
  envoi: boolean;
  surOuvrirAutre: () => void;
  surFermer: () => void;
}

export function OuvertureBooster({ cartes, sets, peutOuvrirAutre, envoi, surOuvrirAutre, surFermer }: Props) {
  const [selection, setSelection] = useState<CarteOuverte | null>(null);

  return (
    <div className="fond-modale" role="dialog" aria-modal="true" aria-label="Ouverture d'un booster">
      <div className="ouverture" onClick={(e) => e.stopPropagation()}>
        <h2>Ton booster</h2>
        <section className="grille-cartes reveal">
          {cartes.map((carte, i) => (
            <button
              key={`${carte.code}-${i}`}
              className={`vignette-carte apparition ${classeRarete(carte)} ${estRarePlus(carte) ? "halo-rarete" : ""}`}
              style={{ animationDelay: `${i * 0.12}s` }}
              onClick={() => setSelection(carte)}
              title={carte.nom}
            >
              <span className={`cadre-carte ${carte.foil ? "voile-foil" : ""}`}>
                <img
                  className={carte.orientation === "paysage" ? "image-paysage" : undefined}
                  src={urlImage(carte.image, 300)}
                  alt={carte.nom}
                />
                {carte.foil && <span className="etiquette-foil">✨ foil</span>}
              </span>
              <span className="legende-carte">{carte.nom}</span>
            </button>
          ))}
        </section>
        <div className="barre-actions actions-ouverture">
          <button onClick={surOuvrirAutre} disabled={!peutOuvrirAutre || envoi}>
            {envoi ? "Ouverture…" : "Ouvrir un autre"}
          </button>
          <button className="secondaire" onClick={() => naviguer("/collection")}>
            Voir ma collection
          </button>
          <button className="secondaire" onClick={surFermer}>
            Fermer
          </button>
        </div>
      </div>
      {selection && (
        <FicheCarte
          carte={selection}
          nomSet={sets.find((s) => s.code === selection.set)?.nom ?? selection.set}
          foil={selection.foil}
          surFermeture={() => setSelection(null)}
        />
      )}
    </div>
  );
}
