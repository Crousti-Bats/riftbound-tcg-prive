/**
 * « Devine le champion » : un champion par jour et par mode (classique, capacité, illustration).
 * Le navigateur n'a jamais la réponse avant de l'avoir trouvée : il envoie un champion, le serveur compare.
 */
import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from "react";
import { ImageCarte } from "../composants/image-carte";
import { appelerApi } from "../outils/appels-api";
import { formaterEclats, publierSolde } from "../outils/eclats";
import {
  type ChampionVue,
  type Colonne,
  type Comparaison,
  type EtatDevinette,
  type Mode,
  MODES,
  normaliser,
  type ResumeMiniJeux,
} from "../outils/minijeux";
import { naviguer } from "../outils/navigation";
import "./mini-jeux.css";

/** Icône carrée du champion (Data Dragon de Riot) ; l'initiale si elle ne se charge pas. */
function Icone({ champion, grande }: { champion: ChampionVue; grande?: boolean }) {
  const [erreur, setErreur] = useState(false);
  const classe = grande ? "mj-icone mj-icone-grande" : "mj-icone";
  if (erreur) return <span className={`${classe} mj-icone-vide`}>{champion.nom.slice(0, 1)}</span>;
  return <img className={classe} src={champion.image} alt="" loading="lazy" onError={() => setErreur(true)} />;
}
const avatar = (ch: ChampionVue) => <Icone champion={ch} />;

export function PageDevineChampion({ mode }: { mode: Mode }) {
  const [etat, setEtat] = useState<EtatDevinette | null>(null);
  const [champions, setChampions] = useState<ChampionVue[] | null>(null);
  const [resume, setResume] = useState<ResumeMiniJeux | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    appelerApi<{ champions: ChampionVue[] }>("GET", "/minijeux/champions").then((r) => setChampions(r.champions), (e: Error) => setErreur(e.message));
  }, []);

  useEffect(() => {
    // Changer de mode remonte la page (key = mode) : l'état repart de zéro sans le remettre à zéro ici.
    let actif = true;
    appelerApi<EtatDevinette>("GET", `/minijeux/devinette/${mode}`).then(
      (r) => actif && setEtat(r),
      (e: Error) => actif && setErreur(e.message),
    );
    appelerApi<ResumeMiniJeux>("GET", "/minijeux").then((r) => actif && setResume(r), () => undefined);
    return () => {
      actif = false;
    };
  }, [mode]);

  const suggestions = useMemo(() => {
    const q = normaliser(recherche);
    if (!q || !champions || !etat) return [];
    const proposes = new Set(etat.essais.map((e) => e.champion.id));
    const restants = champions.filter((ch) => !proposes.has(ch.id));
    const debut = restants.filter((ch) => normaliser(ch.nom).startsWith(q));
    const milieu = restants.filter((ch) => !normaliser(ch.nom).startsWith(q) && normaliser(ch.nom).includes(q));
    return [...debut, ...milieu].slice(0, 8);
  }, [recherche, champions, etat]);

  async function proposer(ch: ChampionVue) {
    if (envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await appelerApi<{ juste: boolean; gain: number; solde: number; etat: EtatDevinette }>("POST", `/minijeux/devinette/${mode}/essai`, {
        champion: ch.id,
      });
      setEtat(r.etat);
      setRecherche("");
      if (r.juste) {
        publierSolde(r.solde);
        appelerApi<ResumeMiniJeux>("GET", "/minijeux").then(setResume, () => undefined);
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setEnvoi(false);
    }
  }

  function valider(e: FormEvent) {
    e.preventDefault();
    const premier = suggestions[0];
    if (premier) void proposer(premier);
  }

  const infosMode = MODES.find((m) => m.code === mode) ?? MODES[0];
  const autresATrouver = MODES.filter((m) => m.code !== mode && resume && !resume.devinette[m.code].trouve);

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
          <h1>Devine le champion</h1>
        </div>
      </header>

      <nav className="onglets" aria-label="Modes de jeu">
        {MODES.map((m) => (
          <button
            key={m.code}
            className={m.code === mode ? "onglet actif" : "onglet"}
            aria-current={m.code === mode ? "page" : undefined}
            onClick={() => naviguer(`/minijeux/champion/${m.code}`, { remplacer: true })}
          >
            {resume?.devinette[m.code].trouve ? "✓ " : ""}
            {m.libelle}
          </button>
        ))}
      </nav>

      {erreur && <p className="message-erreur">{erreur}</p>}
      {!etat && !erreur && <p className="aide">Chargement…</p>}

      {etat && (
        <>
          <section className="carte pile-serree mj-indice">
            <p className="aide">{infosMode.texte}</p>
            <Indice etat={etat} />
            <p className="aide">
              {etat.trouvesAujourdhui === 0
                ? "Personne n'a encore trouvé aujourd'hui."
                : `${etat.trouvesAujourdhui} joueur${etat.trouvesAujourdhui > 1 ? "s ont" : " a"} trouvé aujourd'hui.`}
            </p>
          </section>

          {etat.trouve && etat.reponse ? (
            <section className="carte mj-victoire">
              {etat.reponse.carte ? (
                <ImageCarte image={etat.reponse.carte.image} largeur={300} alt={etat.reponse.carte.nom} className="mj-victoire-carte" />
              ) : (
                <Icone champion={etat.reponse} grande />
              )}
              <div className="pile-serree">
                <span className="surtitre">Bravo !</span>
                <h2>C'était {etat.reponse.nom}</h2>
                <p>
                  Trouvé en {etat.essais.length} essai{etat.essais.length > 1 ? "s" : ""} : <strong>+{formaterEclats(etat.gain)}</strong>
                </p>
                <p className="aide">Un nouveau champion t'attend demain à minuit.</p>
                {autresATrouver.length > 0 && (
                  <div className="barre-actions">
                    {autresATrouver.map((m) => (
                      <button key={m.code} className="secondaire" onClick={() => naviguer(`/minijeux/champion/${m.code}`, { remplacer: true })}>
                        Mode {m.libelle} →
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ) : (
            <form className="mj-recherche" onSubmit={valider}>
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Tape le nom d'un champion…"
                aria-label="Nom du champion"
                autoComplete="off"
                disabled={envoi || !champions}
              />
              <span className="aide">
                Bonne réponse maintenant : <strong>+{formaterEclats(etat.gainPossible)}</strong>
              </span>
              {suggestions.length > 0 && (
                <ul className="mj-suggestions" role="listbox" aria-label="Champions">
                  {suggestions.map((ch) => (
                    <li key={ch.id}>
                      <button type="button" className="mj-suggestion" onClick={() => void proposer(ch)} disabled={envoi}>
                        {avatar(ch)}
                        {ch.nom}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {recherche && suggestions.length === 0 && <p className="aide">Aucun champion de ce nom (ou déjà proposé).</p>}
            </form>
          )}

          {mode === "classique" ? <TableauEssais essais={etat.essais} /> : <ListeEssais essais={etat.essais} />}

          {etat.hier && (
            <p className="aide mj-hier">
              Le champion d'hier : {avatar(etat.hier)} <strong>{etat.hier.nom}</strong>
            </p>
          )}
        </>
      )}
    </main>
  );
}

function Indice({ etat }: { etat: EtatDevinette }) {
  const indice = etat.indice;
  if (!indice) {
    if (etat.trouve) return null;
    return <p className="mj-consigne">Propose un champion : les cases te diront ce qu'il a en commun avec celui du jour.</p>;
  }
  if ("texte" in indice) return <blockquote className="mj-capacite">{indice.texte}</blockquote>;
  if ("emojis" in indice) {
    return (
      <div className="mj-emojis" aria-label={`${indice.emojis.length} emoji(s) sur ${indice.total}`}>
        {Array.from({ length: indice.total }, (_, i) => (
          <span key={i} className={i < indice.emojis.length ? "mj-emoji" : "mj-emoji cache"}>
            {indice.emojis[i] ?? "?"}
          </span>
        ))}
      </div>
    );
  }
  if (etat.trouve && etat.reponse) return null; // la carte entière est montrée dans l'encart de victoire
  return (
    <div className="mj-illustration">
      <img
        src={`/api/minijeux/devinette/illustration/image?jour=${etat.jour}`}
        alt="Illustration à deviner"
        style={{ transform: `scale(${indice.zoom})`, transformOrigin: `${indice.centre.x}% ${indice.centre.y}%` }}
      />
    </div>
  );
}

const fleche = (sens: Colonne<unknown>["sens"]) => (sens === "plus" ? " ↑" : sens === "moins" ? " ↓" : "");

function Case({ colonne, texte, i }: { colonne: Colonne<unknown>; texte: string; i: number }) {
  return (
    <td className={`mj-case mj-${colonne.etat}`} style={{ "--i": i } as CSSProperties}>
      {texte}
      {fleche(colonne.sens)}
    </td>
  );
}

function TableauEssais({ essais }: { essais: EtatDevinette["essais"] }) {
  if (essais.length === 0) return null;
  const lignes = [...essais].reverse();
  const cases = (c: Comparaison) => [
    { colonne: c.genre, texte: c.genre.valeur },
    { colonne: c.postes, texte: c.postes.valeur.join(", ") },
    { colonne: c.especes, texte: c.especes.valeur.join(", ") },
    { colonne: c.ressource, texte: c.ressource.valeur },
    { colonne: c.portee, texte: c.portee.valeur.join(", ") },
    { colonne: c.regions, texte: c.regions.valeur.join(", ") },
    { colonne: c.annee, texte: String(c.annee.valeur) },
  ];
  return (
    <section className="carte pile-serree">
      <div className="tableau-defilant">
        <table className="mj-tableau">
          <thead>
            <tr>
              <th>Champion</th>
              <th>Genre</th>
              <th>Poste(s)</th>
              <th>Espèce(s)</th>
              <th>Ressource</th>
              <th>Portée</th>
              <th>Région(s)</th>
              <th>Année</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((e) => (
              <tr key={e.champion.id}>
                <td className={e.juste ? "mj-case mj-juste mj-champion" : "mj-case mj-champion"}>
                  {avatar(e.champion)}
                  {e.champion.nom}
                </td>
                {e.comparaison && cases(e.comparaison).map((x, i) => <Case key={i} colonne={x.colonne} texte={x.texte} i={i + 1} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="aide mj-legende">
        <span className="mj-puce mj-juste" /> juste <span className="mj-puce mj-partiel" /> en partie <span className="mj-puce mj-faux" /> faux · ↑ le
        champion du jour est sorti plus tard, ↓ plus tôt.
      </p>
    </section>
  );
}

function ListeEssais({ essais }: { essais: EtatDevinette["essais"] }) {
  if (essais.length === 0) return null;
  return (
    <ul className="mj-essais">
      {[...essais].reverse().map((e) => (
        <li key={e.champion.id} className={e.juste ? "mj-juste" : "mj-faux"}>
          {avatar(e.champion)}
          {e.champion.nom}
          <span aria-label={e.juste ? "juste" : "faux"}>{e.juste ? "✓" : "✗"}</span>
        </li>
      ))}
    </ul>
  );
}
