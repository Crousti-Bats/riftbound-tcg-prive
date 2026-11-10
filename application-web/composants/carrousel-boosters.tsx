/**
 * Carrousel « Changer de set » (fin d'ouverture) : tous les boosters côte à côte, on fait défiler
 * (glisser au doigt, flèches ou molette sur PC), on touche celui qu'on veut et il s'ouvre.
 */
import { useEffect, useRef } from "react";

export interface ChoixBooster {
  code: string;
  nom: string;
  /** Visuel du booster (/ouverture/booster-<set>-<n>.webp). */
  image: string;
}

interface Props {
  boosters: ChoixBooster[];
  actuel: string;
  restants: number;
  surChoix: (code: string) => void;
  surFermer: () => void;
}

export function CarrouselBoosters({ boosters, actuel, restants, surChoix, surFermer }: Props) {
  const piste = useRef<HTMLDivElement>(null);

  // À l'ouverture : le booster actuel au centre. On ne fait défiler QUE la piste
  // (scrollIntoView ferait aussi défiler l'écran d'ouverture, et la page d'accueil apparaîtrait derrière).
  useEffect(() => {
    const p = piste.current;
    const el = p?.querySelector<HTMLElement>('[aria-current="true"]');
    if (p && el) p.scrollTo({ left: el.offsetLeft - (p.clientWidth - el.offsetWidth) / 2, behavior: "instant" });
  }, []);

  function defiler(sens: 1 | -1) {
    const el = piste.current;
    const carte = el?.querySelector<HTMLElement>(".ob-carrousel-booster");
    if (el && carte) el.scrollBy({ left: sens * (carte.offsetWidth + 16), behavior: "smooth" });
  }

  const vide = restants < 1;

  return (
    <div className="ob-carrousel" role="dialog" aria-modal="true" aria-label="Choisir un autre booster" onClick={surFermer}>
      <div className="ob-carrousel-contenu" onClick={(e) => e.stopPropagation()}>
        <header className="ob-carrousel-entete">
          <h2>Quel booster ouvrir ?</h2>
          <p>{vide ? "Plus de booster en stock pour l'instant." : `${restants} booster${restants > 1 ? "s" : ""} restant${restants > 1 ? "s" : ""}`}</p>
        </header>

        <div className="ob-carrousel-zone">
          <button type="button" className="ob-carrousel-fleche" onClick={() => defiler(-1)} aria-label="Boosters précédents">
            ‹
          </button>
          <div className="ob-carrousel-piste" ref={piste}>
            {boosters.map((b) => (
              <button
                key={b.code}
                type="button"
                className="ob-carrousel-booster"
                aria-current={b.code === actuel ? "true" : undefined}
                disabled={vide}
                onClick={() => surChoix(b.code)}
              >
                <img src={b.image} alt="" width="621" height="1100" draggable={false} />
                <span className="ob-carrousel-nom">{b.nom}</span>
                {b.code === actuel && <span className="ob-carrousel-actuel">Actuel</span>}
              </button>
            ))}
          </div>
          <button type="button" className="ob-carrousel-fleche" onClick={() => defiler(1)} aria-label="Boosters suivants">
            ›
          </button>
        </div>

        <button type="button" className="ob-bouton-pilule ob-carrousel-annuler" onClick={surFermer}>
          Annuler
        </button>
      </div>
    </div>
  );
}
