/** Ouverture d'un booster en plein écran : le booster officiel à déchirer, les cartes révélées une par une avec une
 *  mise en scène par rareté (moteur dans outils/ouverture-scene.ts), puis le récapitulatif des 14 cartes. */
import "./ouverture-booster.css";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { FicheCarte } from "./fiche-carte";
import { ImageCarte } from "./image-carte";
import type { CarteOuverte } from "../outils/libelles-cartes";
import { naviguer } from "../outils/navigation";
import { REVELATION, categorieRevelation } from "../outils/ouverture-revelation";
import { type Scene, monterScene } from "../outils/ouverture-scene";
import { definirSon, sonActif } from "../outils/ouverture-sons";

interface Props {
  set: string;
  nomSet: string;
  /** Illustration du booster affichée sur l'accueil (le premier booster ouvert reprend la même). */
  illustration?: number;
  /** Appel au serveur (POST /boosters/ouvrir), lancé quand le booster se déchire. */
  ouvrir: () => Promise<CarteOuverte[]>;
  peutOuvrirAutre: boolean;
  surFermer: () => void;
}

export function OuvertureBooster({ set, nomSet, illustration, ouvrir, peutOuvrirAutre, surFermer }: Props) {
  const racine = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const appelOuvrir = useRef(ouvrir);
  const [recap, setRecap] = useState<CarteOuverte[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [son, setSon] = useState(sonActif);
  const [selection, setSelection] = useState<CarteOuverte | null>(null);
  // Booster encore scellé : « Retour » ramène à l'accueil sans rien consommer (le serveur n'est appelé qu'à la déchirure).
  const [scelle, setScelle] = useState(true);

  useEffect(() => {
    appelOuvrir.current = ouvrir;
  }, [ouvrir]);

  // Le moteur possède entièrement le contenu de `racine` (React n'y rend rien).
  useEffect(() => {
    if (!racine.current) return;
    const s = monterScene(racine.current, {
      set,
      nomSet,
      illustration,
      ouvrir: () => {
        setErreur(null);
        setScelle(false);
        return appelOuvrir.current();
      },
      surTerminee: setRecap,
      surErreur: setErreur,
      surAvis: setAvis,
    });
    scene.current = s;
    return () => {
      s.detruire();
      scene.current = null;
    };
  }, [set, nomSet, illustration]);

  useEffect(() => {
    if (!avis) return;
    const t = setTimeout(() => setAvis(null), 3200);
    return () => clearTimeout(t);
  }, [avis]);

  // La page derrière ne défile pas ; Échap ferme (sauf si une fiche est ouverte : elle se ferme d'abord).
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = avant;
    };
  }, []);
  useEffect(() => {
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !selection) surFermer();
    };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [selection, surFermer]);

  function basculerSon() {
    definirSon(!son);
    setSon(!son);
  }

  function ouvrirUnAutre() {
    setRecap(null);
    setErreur(null);
    setScelle(true);
    scene.current?.recommencer();
  }

  const rares = recap?.filter((c) => REVELATION[categorieRevelation(c)].rang >= 2).length ?? 0;

  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-label={`Ouverture d'un booster ${nomSet}`}>
      <div className="ob-racine" ref={racine} />
      <header className="ob-barre">
        {scelle && (
          <button type="button" className="ob-bouton-retour" onClick={surFermer} aria-label="Retour à l'accueil sans ouvrir le booster">
            <span aria-hidden="true">←</span> Retour
          </button>
        )}
        <h2 className="ob-titre-set">
          {nomSet}
          <small>Ouverture de booster</small>
        </h2>
        <div className="ob-reglages">
          <button type="button" className="ob-bouton-discret" aria-pressed={son} onClick={basculerSon}>
            {son ? "Son activé" : "Son coupé"}
          </button>
          {!scelle && (
            <button type="button" className="ob-bouton-discret" onClick={surFermer}>
              Fermer
            </button>
          )}
        </div>
      </header>

      {erreur && (
        <p className="ob-erreur" role="alert">
          {erreur}
        </p>
      )}
      {avis && (
        <p className="ob-avis" role="status">
          {avis}
        </p>
      )}

      {recap && (
        <section className="ob-recap">
          <h2>{nomSet}</h2>
          <p>
            {recap.length} cartes · {rares} rare{rares > 1 ? "s" : ""} ou mieux
          </p>
          <div className="ob-grille">
            {recap.map((carte, i) => {
              const info = REVELATION[categorieRevelation(carte)];
              return (
                <button
                  key={`${carte.code}-${i}`}
                  type="button"
                  className={`ob-mini ${info.rang < 2 ? "ob-discret" : ""} ${carte.foil ? "ob-foil" : ""}`}
                  style={{ "--c": info.couleur, "--i": i } as CSSProperties}
                  onClick={() => setSelection(carte)}
                  title={carte.nom}
                >
                  <span className="cadre-carte">
                    <ImageCarte
                      className={carte.orientation === "paysage" ? "image-paysage" : undefined}
                      image={carte.image}
                      largeur={300}
                      alt={carte.nom}
                    />
                  </span>
                  <em>
                    {carte.foil ? "Foil · " : ""}
                    {info.nom}
                  </em>
                </button>
              );
            })}
          </div>
          <div className="ob-actions-recap">
            <button type="button" className="ob-bouton-principal" onClick={ouvrirUnAutre} disabled={!peutOuvrirAutre}>
              {peutOuvrirAutre ? `Ouvrir un autre ${nomSet}` : "Plus de booster en stock"}
            </button>
            <button type="button" className="ob-bouton-second" onClick={() => naviguer("/collection")}>
              Voir ma collection
            </button>
            <button type="button" className="ob-bouton-second" onClick={surFermer}>
              Fermer
            </button>
          </div>
        </section>
      )}

      {selection && (
        <FicheCarte carte={selection} nomSet={nomSet} foil={selection.foil} surFermeture={() => setSelection(null)} />
      )}
    </div>
  );
}
