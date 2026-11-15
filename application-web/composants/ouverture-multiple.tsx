/**
 * Ouvrir plusieurs boosters d'un coup : les paquets apparaissent, tremblent et éclatent
 * pendant que le serveur tire les cartes, puis un récapitulatif global montre d'abord les meilleures cartes,
 * et le reste regroupé (« ×3 »). Les cartes sont tirées par le serveur, en une seule requête.
 */
import "./ouverture-booster.css";
import "./ouverture-multiple.css";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { FicheCarte } from "./fiche-carte";
import { ImageCarte } from "./image-carte";
import { lireSansAnimation } from "./ouverture-booster";
import type { CarteOuverte } from "../outils/libelles-cartes";
import { naviguer } from "../outils/navigation";
import { REVELATION, categorieRevelation, ordreRecapitulatif } from "../outils/ouverture-revelation";

/** Sets qui ont une ambiance dédiée (mêmes clés que l'ouverture d'un seul booster). */
const SETS_VISUELS = ["ogn", "sfd", "unl", "ven", "rad"];
/** Durée minimale de l'animation des paquets, puis de l'éclat (ms). */
const DUREE_PAQUETS_MS = 1700;
const DUREE_ECLAT_MS = 550;
/** Paquets dessinés au plus (au-delà : « +N »). */
const PAQUETS_AFFICHES = 10;

interface Props {
  set: string;
  nomSet: string;
  nombre: number;
  /** Illustrations des paquets, utilisées à tour de rôle. */
  imagesPaquets: string[];
  /** Appel au serveur (POST /boosters/ouvrir avec nombre) : les cartes booster par booster. */
  ouvrir: (nombre: number) => Promise<CarteOuverte[][]>;
  /** Boosters encore disponibles (stock + offerts), mis à jour par le parent après chaque ouverture. */
  restants: number;
  surFermer: () => void;
}

type Phase = "paquets" | "eclat" | "recap" | "erreur";

interface Groupe {
  carte: CarteOuverte;
  nombre: number;
}

const rang = (c: CarteOuverte) => REVELATION[categorieRevelation(c)].rang;

/** Le reste du récapitulatif : une vignette par carte (normale ou foil), avec le nombre d'exemplaires. */
function regrouper(cartes: CarteOuverte[]): Groupe[] {
  const groupes = new Map<string, Groupe>();
  for (const carte of ordreRecapitulatif(cartes)) {
    const cle = `${carte.code}|${carte.foil ? 1 : 0}`;
    const g = groupes.get(cle);
    if (g) g.nombre += 1;
    else groupes.set(cle, { carte, nombre: 1 });
  }
  return [...groupes.values()];
}

export function OuvertureMultiple({ set, nomSet, nombre, imagesPaquets, ouvrir, restants, surFermer }: Props) {
  const [phase, setPhase] = useState<Phase>("paquets");
  const [boosters, setBoosters] = useState<CarteOuverte[][]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [selection, setSelection] = useState<CarteOuverte | null>(null);
  const [tour, setTour] = useState(0);
  const appelOuvrir = useRef(ouvrir);
  useEffect(() => {
    appelOuvrir.current = ouvrir;
  }, [ouvrir]);
  // UN SEUL appel au serveur par ouverture, même si l'effet est rejoué (mode strict de React en développement) :
  // un second appel consommerait d'autres boosters, ou serait refusé (conflit) et masquerait le premier.
  const appels = useRef(new Map<number, Promise<CarteOuverte[][]>>());

  // Chaque « tour » : appel au serveur et animation en parallèle ; le récapitulatif attend les deux.
  useEffect(() => {
    let actif = true;
    const sansAnimation = lireSansAnimation();
    const attente = new Promise((r) => setTimeout(r, sansAnimation ? 0 : DUREE_PAQUETS_MS));
    let appel = appels.current.get(tour);
    if (!appel) {
      appel = appelOuvrir.current(nombre);
      appels.current.set(tour, appel);
    }
    Promise.all([appel, attente]).then(
      ([resultat]) => {
        if (!actif) return;
        setBoosters(resultat);
        if (sansAnimation) {
          setPhase("recap");
          return;
        }
        setPhase("eclat");
        setTimeout(() => actif && setPhase("recap"), DUREE_ECLAT_MS);
      },
      (e: unknown) => {
        if (!actif) return;
        setErreur(e instanceof Error ? e.message : "Erreur inattendue.");
        setPhase("erreur");
      },
    );
    return () => {
      actif = false;
    };
  }, [nombre, tour]);

  const encore = useCallback(() => {
    setBoosters([]);
    setErreur(null);
    setPhase("paquets");
    setTour((t) => t + 1);
  }, []);

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
      if (e.key === "Escape" && !selection && phase !== "paquets") surFermer();
    };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [selection, phase, surFermer]);

  const cartes = boosters.flat();
  const meilleures = ordreRecapitulatif(cartes.filter((c) => rang(c) >= 2));
  const reste = regrouper(cartes.filter((c) => rang(c) < 2));
  const foils = cartes.filter((c) => c.foil).length;
  // Bilan par catégorie (Rare et mieux), de la plus précieuse à la moins précieuse.
  const bilan = new Map<string, { nom: string; couleur: string; rang: number; n: number }>();
  for (const c of meilleures) {
    const info = REVELATION[categorieRevelation(c)];
    const b = bilan.get(info.nom) ?? { nom: info.nom, couleur: info.couleur, rang: info.rang, n: 0 };
    b.n += 1;
    bilan.set(info.nom, b);
  }
  const affiches = Math.min(nombre, PAQUETS_AFFICHES);

  const vignette = (carte: CarteOuverte, i: number, discret: boolean, exemplaires = 1) => {
    const info = REVELATION[categorieRevelation(carte)];
    return (
      <button
        key={`${carte.code}-${carte.foil ? "f" : "n"}-${i}`}
        type="button"
        className={`ob-mini ${discret ? "ob-discret" : ""} ${carte.foil ? "ob-foil" : ""}`}
        style={{ "--c": info.couleur, "--i": Math.min(i, 30) } as CSSProperties}
        onClick={() => setSelection(carte)}
        title={carte.nom}
      >
        <span className="cadre-carte">
          <ImageCarte className={carte.orientation === "paysage" ? "image-paysage" : undefined} image={carte.image} largeur={300} alt={carte.nom} />
        </span>
        <em>
          {carte.foil ? "Foil · " : ""}
          {info.nom}
        </em>
        {exemplaires > 1 && <span className="om-exemplaires">×{exemplaires}</span>}
      </button>
    );
  };

  return (
    <div
      className="ob-overlay om-overlay"
      data-set={SETS_VISUELS.includes(set) ? set : "ogn"}
      role="dialog"
      aria-modal="true"
      aria-label={`Ouverture de ${nombre} boosters ${nomSet}`}
    >
      <div className="ob-racine" />
      <header className="ob-barre">
        <h2 className="ob-titre-set">
          {nomSet}
          <small>
            Ouverture de {nombre} booster{nombre > 1 ? "s" : ""}
          </small>
        </h2>
        <div className="ob-reglages">
          {phase !== "paquets" && phase !== "eclat" && (
            <button type="button" className="ob-bouton-discret" onClick={surFermer}>
              Fermer
            </button>
          )}
        </div>
      </header>

      {(phase === "paquets" || phase === "eclat") && (
        <div className={phase === "eclat" ? "om-scene om-eclat" : "om-scene"} aria-live="polite">
          <div className="om-paquets" style={{ "--total": affiches } as CSSProperties}>
            {Array.from({ length: affiches }, (_, k) => (
              <img
                key={`${tour}-${k}`}
                className="om-paquet"
                src={imagesPaquets[k % imagesPaquets.length]}
                alt=""
                style={{ "--k": k } as CSSProperties}
              />
            ))}
          </div>
          {nombre > affiches && <span className="om-plus">+{nombre - affiches}</span>}
          <p className="om-attente">
            Ouverture de {nombre} booster{nombre > 1 ? "s" : ""}…
          </p>
          <div className="om-flash" aria-hidden="true" />
        </div>
      )}

      {phase === "erreur" && (
        <div className="om-scene">
          <p className="ob-erreur" role="alert">
            {erreur}
          </p>
          <button type="button" className="ob-bouton-pilule" onClick={surFermer}>
            Retour
          </button>
        </div>
      )}

      {phase === "recap" && (
        <section className="ob-recap om-recap">
          <h2>
            {nombre} booster{nombre > 1 ? "s" : ""} {nomSet}
          </h2>
          <p>
            {cartes.length} cartes · {meilleures.length} rare{meilleures.length > 1 ? "s" : ""} ou mieux · {foils} foil{foils > 1 ? "s" : ""}
          </p>
          {bilan.size > 0 && (
            <div className="om-bilan">
              {[...bilan.values()]
                .sort((a, b) => b.rang - a.rang)
                .map((b) => (
                  <span key={b.nom} className="om-bilan-puce" style={{ "--c": b.couleur } as CSSProperties}>
                    {b.nom} <strong>×{b.n}</strong>
                  </span>
                ))}
            </div>
          )}

          {meilleures.length > 0 && (
            <>
              <h3 className="om-titre">Tes meilleures cartes</h3>
              <div className="ob-grille">{meilleures.map((c, i) => vignette(c, i, false))}</div>
            </>
          )}
          {reste.length > 0 && (
            <>
              <h3 className="om-titre">Le reste</h3>
              <div className="ob-grille om-grille-petite">{reste.map((g, i) => vignette(g.carte, i, true, g.nombre))}</div>
            </>
          )}

          <div className="ob-actions-recap">
            <button type="button" className="ob-bouton-encore" onClick={encore} disabled={restants < nombre}>
              <span className="ob-encore-titre">{restants < nombre ? "Plus assez de boosters" : `Ouvrir encore ${nombre}`}</span>
              <span className="ob-encore-separateur" aria-hidden="true" />
              <span className="ob-encore-stock">
                {restants} restant{restants > 1 ? "s" : ""}
              </span>
            </button>
            <div className="ob-actions-secondaires">
              <button type="button" className="ob-bouton-pilule" onClick={surFermer}>
                Fermer
              </button>
              <button type="button" className="ob-bouton-pilule" onClick={() => naviguer("/collection")}>
                Ma collection
              </button>
            </div>
          </div>
        </section>
      )}

      {selection && <FicheCarte carte={selection} nomSet={nomSet} foil={selection.foil} surFermeture={() => setSelection(null)} />}
    </div>
  );
}
