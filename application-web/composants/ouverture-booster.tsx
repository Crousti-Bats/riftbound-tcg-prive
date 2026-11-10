/** Ouverture d'un booster en plein écran : le booster officiel à déchirer, les cartes révélées une par une avec une
 *  mise en scène par rareté (moteur dans outils/ouverture-scene.ts), puis le récapitulatif des 14 cartes. */
import "./ouverture-booster.css";
import { type ChoixBooster, CarrouselBoosters } from "./carrousel-boosters";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { FicheCarte } from "./fiche-carte";
import { ImageCarte } from "./image-carte";
import type { CarteOuverte } from "../outils/libelles-cartes";
import { naviguer } from "../outils/navigation";
import { REVELATION, categorieRevelation } from "../outils/ouverture-revelation";
import { type Scene, monterScene } from "../outils/ouverture-scene";
import { definirSon, sonActif } from "../outils/ouverture-sons";

const CLE_SANS_ANIMATION = "riftbound-ouverture-sans-animation";

/** Préférence « Animations coupées », retenue dans ce navigateur (stockage indisponible : animations actives). */
function lireSansAnimation(): boolean {
  try {
    return localStorage.getItem(CLE_SANS_ANIMATION) === "1";
  } catch {
    return false;
  }
}
function ecrireSansAnimation(valeur: boolean): void {
  try {
    localStorage.setItem(CLE_SANS_ANIMATION, valeur ? "1" : "0");
  } catch {
    /* préférence non retenue */
  }
}

/** Sets qui ont une ambiance dédiée (mêmes clés que dans outils/ouverture-scene.ts). */
const SETS_VISUELS = ["ogn", "sfd", "unl", "ven", "rad"];

interface Props {
  set: string;
  nomSet: string;
  /** Illustration du booster affichée sur l'accueil (le premier booster ouvert reprend la même). */
  illustration?: number;
  /** Appel au serveur (POST /boosters/ouvrir), lancé quand le booster se déchire. */
  ouvrir: () => Promise<CarteOuverte[]>;
  /** Boosters encore en stock (affiché sur le bouton « Ouvrir un autre »). */
  restants: number;
  /** Boosters proposés par « Changer de set ». */
  boosters: ChoixBooster[];
  /** Un autre set a été choisi dans le carrousel : le parent relance l'ouverture sur ce set. */
  surChangerSet: (code: string) => void;
  /** Le carrousel s'ouvre : le parent change les illustrations des sets qui en ont plusieurs. */
  surOuvrirCarrousel: () => void;
  surFermer: () => void;
}

export function OuvertureBooster({ set, nomSet, illustration, ouvrir, restants, boosters, surChangerSet, surOuvrirCarrousel, surFermer }: Props) {
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
  const [carrousel, setCarrousel] = useState(false);
  const [sansAnimation, setSansAnimation] = useState(lireSansAnimation);
  const sansAnimationRef = useRef(sansAnimation);

  useEffect(() => {
    appelOuvrir.current = ouvrir;
  }, [ouvrir]);

  // Illustration du premier booster, figée au montage : quand le carrousel change les illustrations,
  // la scène en cours ne doit pas être remontée (elle repartirait sur un booster scellé sous le récapitulatif).
  const illustrationInitiale = useRef(illustration);

  // Le moteur possède entièrement le contenu de `racine` (React n'y rend rien).
  useEffect(() => {
    if (!racine.current) return;
    const s = monterScene(racine.current, {
      set,
      nomSet,
      illustration: illustrationInitiale.current,
      ouvrir: () => {
        setErreur(null);
        setScelle(false);
        return appelOuvrir.current();
      },
      surTerminee: setRecap,
      surErreur: setErreur,
      surAvis: setAvis,
      sansAnimation: () => sansAnimationRef.current,
    });
    scene.current = s;
    return () => {
      s.detruire();
      scene.current = null;
    };
  }, [set, nomSet]);

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
      if (e.key !== "Escape" || selection) return;
      if (carrousel) setCarrousel(false);
      else surFermer();
    };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [selection, carrousel, surFermer]);

  function choisirBooster(code: string) {
    setCarrousel(false);
    if (code === set) ouvrirUnAutre(boosters.find((b) => b.code === code)?.illustration);
    else surChangerSet(code);
  }

  function basculerAnimation() {
    const valeur = !sansAnimation;
    sansAnimationRef.current = valeur;
    ecrireSansAnimation(valeur);
    setSansAnimation(valeur);
  }

  function basculerSon() {
    definirSon(!son);
    setSon(!son);
  }

  function ouvrirUnAutre(illustration?: number) {
    setRecap(null);
    setErreur(null);
    setScelle(true);
    scene.current?.recommencer(illustration);
  }

  const rares = recap?.filter((c) => REVELATION[categorieRevelation(c)].rang >= 2).length ?? 0;

  return (
    <div
      className={sansAnimation ? "ob-overlay ob-sobre" : "ob-overlay"}
      data-set={SETS_VISUELS.includes(set) ? set : "ogn"}
      role="dialog"
      aria-modal="true"
      aria-label={`Ouverture d'un booster ${nomSet}`}
    >
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
          <button
            type="button"
            className="ob-bouton-discret"
            aria-pressed={!sansAnimation}
            onClick={basculerAnimation}
            title="Animations coupées : les cartes se révèlent une par une, sans retournement ni effets"
          >
            {sansAnimation ? "Animations coupées" : "Animations"}
          </button>
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
          {/* Barre collée en bas de l'écran : toujours visible, même sur téléphone avec 14 cartes au-dessus. */}
          <div className="ob-actions-recap">
            <button type="button" className="ob-bouton-encore" onClick={() => ouvrirUnAutre()} disabled={restants < 1}>
              <span className="ob-encore-titre">{restants < 1 ? "Plus de booster" : "Ouvrir un autre"}</span>
              <span className="ob-encore-separateur" aria-hidden="true" />
              <span className="ob-encore-stock">
                {restants < 1 ? "Reviens plus tard" : `${restants} restant${restants > 1 ? "s" : ""}`}
              </span>
            </button>
            <div className="ob-actions-secondaires">
              <button
                type="button"
                className="ob-bouton-pilule"
                onClick={() => {
                  surOuvrirCarrousel();
                  setCarrousel(true);
                }}
              >
                Changer de set
              </button>
              <button type="button" className="ob-bouton-pilule" onClick={() => naviguer("/collection")}>
                Ma collection
              </button>
            </div>
          </div>
        </section>
      )}

      {carrousel && (
        <CarrouselBoosters boosters={boosters} actuel={set} restants={restants} surChoix={choisirBooster} surFermer={() => setCarrousel(false)} />
      )}

      {selection && (
        <FicheCarte carte={selection} nomSet={nomSet} foil={selection.foil} surFermeture={() => setSelection(null)} />
      )}
    </div>
  );
}
