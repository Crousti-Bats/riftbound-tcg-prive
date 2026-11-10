/**
 * Tutoriel interactif /tutoriel : une partie solo guidée sur la vraie table (PlateauTable), contre l'ordinateur.
 * La partie tourne dans le navigateur avec le moteur de la table : rien n'est envoyé au serveur ni enregistré.
 * Le scénario et son déroulé (ControleurTutoriel) sont dans outils/tutoriel.ts ; cette page ne fait qu'afficher.
 */
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { naviguer } from "../outils/navigation";
import { MESSAGES_TABLE } from "../outils/table";
import { ControleurTutoriel, ETAPES, MOI, PSEUDO_ADVERSAIRE } from "../outils/tutoriel";
import { PlateauTable } from "./page-table";

/** « **gras** » → <strong>. */
function enrichir(texte: string): ReactNode[] {
  return texte.split(/\*\*(.+?)\*\*/g).map((morceau, i) => (i % 2 ? <strong key={i}>{morceau}</strong> : morceau));
}

export function PageTutoriel({ pseudo }: { pseudo: string }) {
  const [controleur] = useState(() => new ControleurTutoriel(pseudo, MESSAGES_TABLE));
  const instant = useSyncExternalStore(controleur.abonner, controleur.lire);
  const [reduit, setReduit] = useState(false);
  useEffect(() => controleur.arreter, [controleur]);

  const { etape, bravo, automatique, libre } = instant;
  const courante = ETAPES[etape];
  const derniere = etape === ETAPES.length - 1;

  let panneau: ReactNode;
  if (libre || !courante) {
    panneau = (
      <button className="tuto-rouvrir petit" onClick={controleur.recommencer}>
        Recommencer le tuto
      </button>
    );
  } else {
    let actions: ReactNode;
    if (bravo) actions = <p className="tuto-bravo">Bien joué !</p>;
    else if (courante.adversaire) actions = <p className="tuto-attente">{PSEUDO_ADVERSAIRE} joue…</p>;
    else {
      actions = (
        <div className="actions-ligne">
          {courante.reussie ? (
            <button className="secondaire petit" disabled={automatique} onClick={controleur.montrer}>
              {automatique ? "Regarde…" : "Montre-moi"}
            </button>
          ) : (
            <button className="petit" onClick={controleur.valider}>
              {courante.bouton ?? "Suivant"}
            </button>
          )}
          {derniere && (
            <>
              <button className="secondaire petit" onClick={controleur.recommencer}>
                Recommencer
              </button>
              <button className="secondaire petit" onClick={() => naviguer("/jouer")}>
                Défier un ami
              </button>
            </>
          )}
        </div>
      );
    }
    panneau = (
      <aside className={reduit ? "tuto-panneau reduit" : "tuto-panneau"} aria-label="Tutoriel" aria-live="polite">
        <div className="tuto-entete">
          <span className="surtitre">
            Tuto · étape {etape + 1}/{ETAPES.length}
          </span>
          <button className="bouton-icone" onClick={() => setReduit(!reduit)} aria-label={reduit ? "Agrandir le tutoriel" : "Réduire le tutoriel"}>
            {reduit ? "▴" : "▾"}
          </button>
        </div>
        <div className="tuto-progression" aria-hidden="true">
          <span style={{ width: `${((etape + (bravo ? 1 : 0)) / (ETAPES.length - 1)) * 100}%` }} />
        </div>
        <h2>{courante.titre}</h2>
        {!reduit && (
          <>
            {courante.texte.map((p, i) => (
              <p key={i}>{enrichir(p)}</p>
            ))}
            {courante.consignes && (
              <ol className="tuto-consignes">
                {courante.consignes.map((c, i) => (
                  <li key={i}>{enrichir(c)}</li>
                ))}
              </ol>
            )}
          </>
        )}
        {actions}
        {!derniere && !reduit && (
          <button className="tuto-recommencer" onClick={controleur.recommencer}>
            Recommencer depuis le début
          </button>
        )}
      </aside>
    );
  }

  return (
    <PlateauTable
      key={instant.partie}
      vue={instant.vue}
      moi={MOI}
      envoyer={controleur.envoyer}
      erreur={instant.erreur}
      effacerErreur={controleur.effacerErreur}
      statut={<span className="table-connexion">Tutoriel</span>}
      surQuitter={() => naviguer("/jouer")}
      libelleQuitter="Quitter le tuto"
      sansMulligan
      enfants={panneau}
    />
  );
}
