/**
 * Memory : 8 paires de cartes (de ma collection) sur 16 cases. La grille reste sur le serveur :
 * chaque case retournée est demandée au serveur, qui compte les coups et crédite les éclats en fin de partie.
 */
import { useEffect, useRef, useState } from "react";
import { ImageCarte } from "../composants/image-carte";
import { appelerApi } from "../outils/appels-api";
import { formaterEclats, publierSolde } from "../outils/eclats";
import type { CarteMemory, CoupMemory } from "../outils/minijeux";
import { naviguer } from "../outils/navigation";
import "./mini-jeux.css";

interface CaseVue {
  carte: CarteMemory | null;
  visible: boolean;
  trouvee: boolean;
}

interface Partie {
  id: number;
  gainsDuJour: number;
  plafond: number;
}

const casesVides = (n: number): CaseVue[] => Array.from({ length: n }, () => ({ carte: null, visible: false, trouvee: false }));

/** Temps pendant lequel une paire ratée reste visible avant de se retourner. */
const DELAI_RETOUR_MS = 900;

/** Étoiles de la partie, selon le barème des gains (12 coups ou moins, 16 ou moins, au-delà). */
const etoiles = (coups: number) => (coups <= 12 ? 3 : coups <= 16 ? 2 : 1);

/** Horloge, appelée seulement dans les gestionnaires de clic (jamais pendant le rendu). */
const horloge = () => Date.now();

const chrono = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function PageMemory() {
  const [partie, setPartie] = useState<Partie | null>(null);
  const [cases, setCases] = useState<CaseVue[]>(casesVides(16));
  const [coups, setCoups] = useState(0);
  const [occupe, setOccupe] = useState(false);
  const [fin, setFin] = useState<{ coups: number; gain: number; duree: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [debut, setDebut] = useState<number | null>(null);
  const [maintenant, setMaintenant] = useState(horloge);
  const minuteur = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (minuteur.current) window.clearTimeout(minuteur.current);
    },
    [],
  );

  // Chronomètre : du premier coup à la dernière paire.
  useEffect(() => {
    if (debut === null || fin) return;
    const t = window.setInterval(() => setMaintenant(horloge()), 500);
    return () => window.clearInterval(t);
  }, [debut, fin]);

  async function nouvellePartie() {
    if (minuteur.current) window.clearTimeout(minuteur.current);
    setErreur(null);
    setOccupe(true);
    try {
      const r = await appelerApi<Partie & { cases: number }>("POST", "/minijeux/memory", {});
      setPartie({ id: r.id, gainsDuJour: r.gainsDuJour, plafond: r.plafond });
      setCases(casesVides(r.cases));
      setCoups(0);
      setFin(null);
      setDebut(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setOccupe(false);
    }
  }

  async function retourner(position: number) {
    const c = cases[position];
    if (!partie || occupe || fin || !c || c.visible || c.trouvee) return;
    setOccupe(true);
    setErreur(null);
    const depart = debut ?? horloge();
    if (debut === null) {
      setDebut(depart);
      setMaintenant(depart);
    }
    try {
      const r = await appelerApi<CoupMemory>("POST", `/minijeux/memory/${partie.id}/retourner`, { position });
      setCoups(r.coups);
      const montrer = (liste: CaseVue[], pos: number, carte: CarteMemory, trouvee = false) =>
        liste.map((x, i) => (i === pos ? { carte, visible: true, trouvee } : x));
      if (!r.premiere) {
        setCases((l) => montrer(l, position, r.carte));
        setOccupe(false);
        return;
      }
      const premiere = r.premiere;
      setCases((l) => montrer(montrer(l, premiere.position, premiere.carte, r.paire), position, r.carte, r.paire));
      if (r.terminee) {
        setFin({ coups: r.coups, gain: r.gain ?? 0, duree: horloge() - depart });
        if (r.solde !== undefined) publierSolde(r.solde);
        setPartie((p) => (p ? { ...p, gainsDuJour: p.gainsDuJour + (r.gain ?? 0) } : p));
        setOccupe(false);
      } else if (r.paire) {
        setOccupe(false);
      } else {
        minuteur.current = window.setTimeout(() => {
          setCases((l) => l.map((x, i) => (i === position || i === premiere.position ? { ...x, visible: false } : x)));
          setOccupe(false);
        }, DELAI_RETOUR_MS);
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inattendue.");
      setOccupe(false);
    }
  }

  const paires = cases.filter((x) => x.trouvee).length / 2;
  const duree = fin ? fin.duree : debut === null ? 0 : maintenant - debut;

  return (
    <main className="conteneur pile mj-page">
      <header className="mj-entete">
        <div>
          <a
            href="/minijeux"
            className="mj-retour"
            onClick={(e) => {
              e.preventDefault();
              naviguer("/minijeux");
            }}
          >
            ← Mini-jeux
          </a>
          <h1>Memory</h1>
        </div>
        {partie && (
          <button className="secondaire" onClick={() => void nouvellePartie()} disabled={occupe && !fin}>
            ↻ Nouvelle partie
          </button>
        )}
      </header>

      <div className="mj-tableau-de-bord">
        <div className="mj-stat">
          <span>Coups</span>
          <strong>{coups}</strong>
        </div>
        <div className="mj-stat">
          <span>Paires</span>
          <strong>
            {paires}
            <small> / {cases.length / 2}</small>
          </strong>
        </div>
        <div className="mj-stat">
          <span>Temps</span>
          <strong>{chrono(duree)}</strong>
        </div>
        <div className="mj-stat mj-stat-large">
          <span>Éclats du jour</span>
          {partie ? (
            <div className="mj-jauge" aria-label={`${partie.gainsDuJour} éclats gagnés sur ${partie.plafond} aujourd'hui`}>
              <span className="mj-jauge-remplie" style={{ width: `${Math.min(100, (partie.gainsDuJour / partie.plafond) * 100)}%` }} />
              <span className="mj-jauge-texte">
                {partie.gainsDuJour} / {formaterEclats(partie.plafond)}
              </span>
            </div>
          ) : (
            <strong className="mj-bareme">★★★ 10 💎 · ★★ 6 💎 · ★ 3 💎</strong>
          )}
        </div>
      </div>
      {erreur && <p className="message-erreur">{erreur}</p>}

      <div className="mj-plateau">
        <div className={partie ? "mj-grille" : "mj-grille en-attente"}>
          {cases.map((c, i) => (
            <button
              key={i}
              className={`mj-carte${c.visible || c.trouvee ? " retournee" : ""}${c.trouvee ? " trouvee" : ""}`}
              onClick={() => void retourner(i)}
              disabled={!partie}
              aria-label={c.visible || c.trouvee ? (c.carte?.nom ?? "Carte") : `Case ${i + 1}, face cachée`}
            >
              <span className="mj-carte-interieur">
                <span className="mj-dos" aria-hidden="true">
                  <img src="/icones/logo-transparent-512.png" alt="" />
                </span>
                <span className="mj-carte-face">{c.carte && <ImageCarte image={c.carte.image} largeur={300} alt={c.carte.nom} />}</span>
              </span>
            </button>
          ))}
        </div>

        {!partie && (
          <div className="mj-plateau-voile">
            <div className="mj-plateau-message">
              <span className="surtitre">Memory</span>
              <h2>Retrouve les 8 paires</h2>
              <p className="aide">Des cartes de ta collection. Moins tu fais de coups, plus tu gagnes d'éclats.</p>
              <button onClick={() => void nouvellePartie()} disabled={occupe}>
                Jouer
              </button>
            </div>
          </div>
        )}

        {fin && (
          <div className="mj-plateau-voile">
            <div className="mj-plateau-message mj-fin">
              <span className="mj-etoiles" aria-label={`${etoiles(fin.coups)} étoile(s) sur 3`}>
                {[1, 2, 3].map((n) => (
                  <span key={n} className={n <= etoiles(fin.coups) ? "allumee" : ""}>
                    ★
                  </span>
                ))}
              </span>
              <h2>Bravo !</h2>
              <p>
                {fin.coups} coups en {chrono(fin.duree)}
              </p>
              <span className="mj-pastille mj-pastille-or">{fin.gain > 0 ? `+${formaterEclats(fin.gain)}` : "Plafond du jour atteint"}</span>
              <button onClick={() => void nouvellePartie()}>Rejouer</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
