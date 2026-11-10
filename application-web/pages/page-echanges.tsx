/** Mes échanges : propositions reçues (accepter / refuser), envoyées (annuler) et historique. */
import { LienJoueur } from "../composants/avatar-joueur";
import { useCallback, useEffect, useState } from "react";
import { type ElementListe, ListeCartesEchange } from "../composants/liste-cartes-echange";
import { appelerApi } from "../outils/appels-api";
import { cleLigne, type EchangeVue, LIBELLES_STATUT, type LigneEchangeVue, type ListesEchanges, pointDeVue } from "../outils/echanges";
import { formaterDate, naviguer } from "../outils/navigation";

type Onglet = "recues" | "envoyees" | "historique";

function versElements(lignes: LigneEchangeVue[]): ElementListe[] {
  return lignes.map((l) => ({ cle: cleLigne(l.code, l.foil), carte: l.carte, code: l.code, foil: l.foil, quantite: l.quantite }));
}

/** « dans 23 h » / « dans 12 min » */
function tempsRestant(expireLe: number): string {
  const ms = expireLe - Date.now();
  if (ms <= 0) return "expirée";
  const heures = Math.floor(ms / 3_600_000);
  return heures >= 1 ? `expire dans ${heures} h` : `expire dans ${Math.max(1, Math.round(ms / 60_000))} min`;
}

export function PageEchanges() {
  const [onglet, setOnglet] = useState<Onglet>("recues");
  const [listes, setListes] = useState<ListesEchanges | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<number | null>(null);

  const recharger = useCallback(async () => {
    try {
      setListes(await appelerApi<ListesEchanges>("GET", "/echanges"));
      setErreur(null);
    } catch (e) {
      setErreur((e as Error).message);
    }
  }, []);

  useEffect(() => {
    appelerApi<ListesEchanges>("GET", "/echanges").then(setListes, (e: Error) => setErreur(e.message));
  }, []);

  async function agir(e: EchangeVue, action: "accepter" | "refuser" | "annuler") {
    const questions = {
      accepter: `Accepter l'échange avec ${pointDeVue(e).autre} ? Les cartes seront transférées immédiatement.`,
      refuser: `Refuser la proposition de ${e.auteur} ?`,
      annuler: `Annuler ta proposition à ${e.destinataire} ?`,
    };
    if (!window.confirm(questions[action])) return;
    setEnCours(e.id);
    setInfo(null);
    try {
      await appelerApi("POST", `/echanges/${e.id}/${action}`, {});
      setInfo(action === "accepter" ? "Échange effectué ! Les cartes sont dans ta collection." : null);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnCours(null);
      await recharger();
    }
  }

  const affichees = listes ? listes[onglet] : [];

  return (
    <main className="conteneur">
      <header className="entete">
        <h1>Échanges</h1>
        <nav className="barre-actions">
          <button onClick={() => naviguer("/echanges/nouveau")}>Nouvel échange</button>
        </nav>
      </header>

      <nav className="onglets">
        {(
          [
            ["recues", `Reçues${listes?.recues.length ? ` (${listes.recues.length})` : ""}`],
            ["envoyees", `Envoyées${listes?.envoyees.length ? ` (${listes.envoyees.length})` : ""}`],
            ["historique", "Historique"],
          ] as const
        ).map(([valeur, libelle]) => (
          <button key={valeur} className={valeur === onglet ? "onglet actif" : "onglet"} onClick={() => setOnglet(valeur)}>
            {libelle}
          </button>
        ))}
      </nav>

      {info && <p className="message-succes">{info}</p>}
      {erreur && <p className="message-erreur">{erreur}</p>}
      {!listes && !erreur && <p className="aide">Chargement…</p>}
      {listes && affichees.length === 0 && (
        <p className="aide">
          {onglet === "recues" ? "Aucune proposition reçue pour l'instant." : onglet === "envoyees" ? "Aucune proposition en attente." : "Aucun échange terminé."}
        </p>
      )}

      <div className="pile">
        {affichees.map((e) => {
          const { jeRecois, jeDonne, autre } = pointDeVue(e);
          return (
            <article key={e.id} className="carte carte-echange">
              <header className="entete-echange">
                <strong>{e.jeSuisAuteur ? <>Ta proposition à <LienJoueur pseudo={autre} /></> : <><LienJoueur pseudo={autre} /> te propose un échange</>}</strong>
                <span className="aide">
                  {e.statut === "en_attente" ? tempsRestant(e.expireLe) : `${LIBELLES_STATUT[e.statut]} · ${formaterDate(e.termineLe)}`}
                </span>
              </header>
              {e.message && <p className="message-echange">« {e.message} »</p>}
              <div className="colonnes-echange">
                <div>
                  <h3>Tu reçois</h3>
                  <ListeCartesEchange elements={versElements(jeRecois)} vide="Rien (c'est un don)" />
                </div>
                <div>
                  <h3>Tu donnes</h3>
                  <ListeCartesEchange elements={versElements(jeDonne)} vide="Rien (c'est un don)" />
                </div>
              </div>
              {e.statut === "en_attente" && (
                <div className="barre-actions">
                  {!e.jeSuisAuteur && (
                    <>
                      <button disabled={enCours === e.id} onClick={() => agir(e, "accepter")}>
                        Accepter
                      </button>
                      <button className="danger" disabled={enCours === e.id} onClick={() => agir(e, "refuser")}>
                        Refuser
                      </button>
                    </>
                  )}
                  {e.jeSuisAuteur && (
                    <button className="secondaire" disabled={enCours === e.id} onClick={() => agir(e, "annuler")}>
                      Annuler ma proposition
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
