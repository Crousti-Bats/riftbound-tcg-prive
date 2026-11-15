/**
 * « Devine le champion » : un champion par jour et par mode (classique, emoji, capacité, illustration).
 * Le navigateur n'a jamais la réponse avant de l'avoir trouvée : il envoie un champion, le serveur compare.
 */
import { type CSSProperties, type FormEvent, type KeyboardEvent, useEffect, useMemo, useState } from "react";
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
  useCompteARebours,
} from "../outils/minijeux";
import { naviguer } from "../outils/navigation";
import "./mini-jeux.css";

/** Icône carrée du champion (Data Dragon de Riot) ; l'initiale si elle ne se charge pas. */
function Icone({ champion, taille = "normale" }: { champion: ChampionVue; taille?: "normale" | "tableau" | "grande" }) {
  const [erreur, setErreur] = useState(false);
  const classe = `mj-icone mj-icone-${taille}`;
  if (erreur) return <span className={`${classe} mj-icone-vide`}>{champion.nom.slice(0, 1)}</span>;
  return <img className={classe} src={champion.image} alt="" loading="lazy" onError={() => setErreur(true)} />;
}

export function PageDevineChampion({ mode }: { mode: Mode }) {
  const [etat, setEtat] = useState<EtatDevinette | null>(null);
  const [champions, setChampions] = useState<ChampionVue[] | null>(null);
  const [resume, setResume] = useState<ResumeMiniJeux | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [selection, setSelection] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const prochain = useCompteARebours();

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
      setSelection(0);
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
    const choisi = suggestions[Math.min(selection, suggestions.length - 1)];
    if (choisi) void proposer(choisi);
  }

  function clavier(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelection((n) => Math.min(n + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelection((n) => Math.max(n - 1, 0));
    } else if (e.key === "Escape") {
      setRecherche("");
    }
  }

  const infosMode = MODES.find((m) => m.code === mode) ?? MODES[0];
  const autresATrouver = MODES.filter((m) => m.code !== mode && resume && !resume.devinette[m.code].trouve);

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
          <h1>Devine le champion</h1>
        </div>
        <span className="mj-pastille">⏳ Prochain champion dans {prochain}</span>
      </header>

      <nav className="mj-onglets" aria-label="Modes de jeu">
        {MODES.map((m) => {
          const trouve = resume?.devinette[m.code].trouve;
          return (
            <button
              key={m.code}
              className={`mj-onglet${m.code === mode ? " actif" : ""}${trouve ? " trouve" : ""}`}
              aria-current={m.code === mode ? "page" : undefined}
              onClick={() => naviguer(`/minijeux/champion/${m.code}`, { remplacer: true })}
            >
              <span className="mj-onglet-icone" aria-hidden="true">
                {m.icone}
              </span>
              <span>{m.libelle}</span>
              {trouve && (
                <span className="mj-onglet-ok" aria-label="trouvé">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {erreur && <p className="message-erreur">{erreur}</p>}
      {!etat && !erreur && <p className="aide">Chargement…</p>}

      {etat && (
        <>
          {!etat.trouve && (
            <section className="mj-panneau">
              <span className="mj-panneau-titre">
                {infosMode.icone} {infosMode.libelle}
              </span>
              <p className="mj-panneau-consigne">{infosMode.texte}</p>
              <Indice etat={etat} />
              <div className="mj-pastilles">
                <span className="mj-pastille">
                  🎯 {etat.essais.length} essai{etat.essais.length > 1 ? "s" : ""}
                </span>
                <span className="mj-pastille mj-pastille-or">💎 +{etat.gainPossible} si tu trouves maintenant</span>
                <span className="mj-pastille">
                  👥 {etat.trouvesAujourdhui} joueur{etat.trouvesAujourdhui > 1 ? "s ont" : " a"} trouvé
                </span>
              </div>
            </section>
          )}

          {etat.trouve && etat.reponse ? (
            <section className="mj-victoire">
              {etat.reponse.splash && <div className="mj-victoire-fond" aria-hidden="true" style={{ backgroundImage: `url(${etat.reponse.splash})` }} />}
              <div className="mj-victoire-contenu">
                {etat.reponse.splash ? (
                  <img src={etat.reponse.splash} alt={`Splash art de ${etat.reponse.nom}`} className="mj-victoire-splash" />
                ) : etat.reponse.carte ? (
                  <ImageCarte image={etat.reponse.carte.image} largeur={300} alt={etat.reponse.carte.nom} className="mj-victoire-carte" />
                ) : (
                  <Icone champion={etat.reponse} taille="grande" />
                )}
                <div className="mj-victoire-texte">
                  <span className="mj-victoire-bravo">Bravo !</span>
                  <h2>C'était {etat.reponse.nom}</h2>
                  {mode === "emoji" && etat.indice && "emojis" in etat.indice && <p className="mj-victoire-emojis">{etat.indice.emojis.join(" ")}</p>}
                  <div className="mj-pastilles">
                    <span className="mj-pastille">
                      🎯 Trouvé en {etat.essais.length} essai{etat.essais.length > 1 ? "s" : ""}
                    </span>
                    <span className="mj-pastille mj-pastille-or">+{formaterEclats(etat.gain)}</span>
                  </div>
                  <p className="aide">Prochain champion dans {prochain}.</p>
                  {autresATrouver.length > 0 && (
                    <div className="barre-actions">
                      {autresATrouver.map((m) => (
                        <button key={m.code} className="secondaire" onClick={() => naviguer(`/minijeux/champion/${m.code}`, { remplacer: true })}>
                          {m.icone} Mode {m.libelle} →
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <form className="mj-recherche" onSubmit={valider}>
              <div className="mj-champ-recherche">
                <span aria-hidden="true">🔍</span>
                <input
                  type="search"
                  value={recherche}
                  onChange={(e) => {
                    setRecherche(e.target.value);
                    setSelection(0);
                  }}
                  onKeyDown={clavier}
                  placeholder="Tape le nom d'un champion…"
                  aria-label="Nom du champion"
                  autoComplete="off"
                  disabled={envoi || !champions}
                />
              </div>
              {suggestions.length > 0 && (
                <ul className="mj-suggestions" role="listbox" aria-label="Champions">
                  {suggestions.map((ch, i) => (
                    <li key={ch.id}>
                      <button
                        type="button"
                        className={i === selection ? "mj-suggestion choisie" : "mj-suggestion"}
                        onClick={() => void proposer(ch)}
                        onMouseEnter={() => setSelection(i)}
                        disabled={envoi}
                        role="option"
                        aria-selected={i === selection}
                      >
                        <Icone champion={ch} />
                        {ch.nom}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {recherche && suggestions.length === 0 && <p className="mj-aucun">Aucun champion de ce nom (ou déjà proposé).</p>}
            </form>
          )}

          {mode === "classique" ? <TableauEssais essais={etat.essais} /> : <ListeEssais essais={etat.essais} />}

          {etat.hier && (
            <p className="mj-hier">
              Le champion d'hier : <Icone champion={etat.hier} /> <strong>{etat.hier.nom}</strong>
            </p>
          )}
        </>
      )}
    </main>
  );
}

function Indice({ etat }: { etat: EtatDevinette }) {
  const indice = etat.indice;
  if (!indice) return <p className="mj-consigne">Propose un champion : chaque case te dira ce qu'il a en commun avec celui du jour.</p>;
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
  return (
    <div className="mj-illustration">
      <img
        src={`/api/minijeux/devinette/illustration/image?jour=${etat.jour}`}
        alt="Splash art à deviner"
        style={{ transform: `scale(${indice.zoom})`, transformOrigin: `${indice.centre.x}% ${indice.centre.y}%` }}
      />
      <span className="mj-zoom">×{indice.zoom}</span>
    </div>
  );
}

function Case({ colonne, texte, i }: { colonne: Colonne<unknown>; texte: string; i: number }) {
  const sens = colonne.sens === "plus" ? " mj-plus" : colonne.sens === "moins" ? " mj-moins" : "";
  return (
    <td className={`mj-case mj-${colonne.etat}${sens}`} style={{ "--i": i } as CSSProperties}>
      <span>{texte}</span>
    </td>
  );
}

const COLONNES = ["Genre", "Poste(s)", "Espèce(s)", "Ressource", "Portée", "Région(s)", "Année"];

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
    <section className="mj-grille-essais">
      <div className="tableau-defilant">
        <table className="mj-tableau">
          <thead>
            <tr>
              <th>Champion</th>
              {COLONNES.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((e) => (
              <tr key={e.champion.id}>
                <td className={e.juste ? "mj-case-champion juste" : "mj-case-champion"} title={e.champion.nom}>
                  <Icone champion={e.champion} taille="tableau" />
                  <span>{e.champion.nom}</span>
                </td>
                {e.comparaison && cases(e.comparaison).map((x, i) => <Case key={i} colonne={x.colonne} texte={x.texte} i={i + 1} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mj-legende">
        <span className="mj-puce mj-juste" /> juste <span className="mj-puce mj-partiel" /> en partie <span className="mj-puce mj-faux" /> faux
        <span className="mj-legende-sep">·</span>▲ le champion du jour est sorti plus tard, ▼ plus tôt
      </p>
    </section>
  );
}

function ListeEssais({ essais }: { essais: EtatDevinette["essais"] }) {
  if (essais.length === 0) return null;
  return (
    <ul className="mj-essais">
      {[...essais].reverse().map((e) => (
        <li key={e.champion.id} className={e.juste ? "mj-essai juste" : "mj-essai"}>
          <Icone champion={e.champion} />
          <span>{e.champion.nom}</span>
          <span className="mj-essai-marque" aria-label={e.juste ? "juste" : "faux"}>
            {e.juste ? "✓" : "✗"}
          </span>
        </li>
      ))}
    </ul>
  );
}
