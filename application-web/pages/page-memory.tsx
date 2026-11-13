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

export function PageMemory() {
  const [partie, setPartie] = useState<Partie | null>(null);
  const [cases, setCases] = useState<CaseVue[]>(casesVides(16));
  const [coups, setCoups] = useState(0);
  const [occupe, setOccupe] = useState(false);
  const [fin, setFin] = useState<{ coups: number; gain: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const minuteur = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (minuteur.current) window.clearTimeout(minuteur.current);
    },
    [],
  );

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
        setFin({ coups: r.coups, gain: r.gain ?? 0 });
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

  return (
    <main className="conteneur pile">
      <header className="entete">
        <div>
          <a
            href="/minijeux"
            className="aide"
            onClick={(e) => {
              e.preventDefault();
              naviguer("/minijeux");
            }}
          >
            ← Mini-jeux
          </a>
          <h1>Memory</h1>
        </div>
        <button onClick={() => void nouvellePartie()} disabled={occupe && !fin}>
          {partie ? "Nouvelle partie" : "Jouer"}
        </button>
      </header>

      <p className="aide">
        Retrouve les 8 paires en un minimum de coups : 10 💎 en 12 coups ou moins, 6 💎 en 16, 3 💎 au-delà.
        {partie && ` Gagné aujourd'hui : ${partie.gainsDuJour} / ${formaterEclats(partie.plafond)}.`}
      </p>
      {erreur && <p className="message-erreur">{erreur}</p>}

      {partie && (
        <>
          <p className="mj-score">
            <span>
              Coups : <strong>{coups}</strong>
            </span>
            <span>
              Paires : <strong>{paires}</strong> / {cases.length / 2}
            </span>
          </p>
          {fin && (
            <section className="carte mj-fin-memory">
              <span className="surtitre">Partie terminée</span>
              <h2>
                {fin.coups} coups · {fin.gain > 0 ? `+${formaterEclats(fin.gain)}` : "plafond du jour atteint"}
              </h2>
              <button onClick={() => void nouvellePartie()}>Rejouer</button>
            </section>
          )}
          <div className="mj-grille">
            {cases.map((c, i) => (
              <button
                key={i}
                className={`mj-carte${c.visible || c.trouvee ? " retournee" : ""}${c.trouvee ? " trouvee" : ""}`}
                onClick={() => void retourner(i)}
                aria-label={c.visible || c.trouvee ? (c.carte?.nom ?? "Carte") : `Case ${i + 1}, face cachée`}
              >
                <span className="mj-carte-interieur">
                  <span className="mj-carte-dos" aria-hidden="true">
                    <img src="/icones/logo-transparent-512.png" alt="" />
                  </span>
                  <span className="mj-carte-face">{c.carte && <ImageCarte image={c.carte.image} largeur={300} alt={c.carte.nom} />}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
