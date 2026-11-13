/** Jouer : mes parties (créer, rejoindre avec un code, reprendre) et mes decks (liste et création).
 *  Un deck se construit avec les cartes de sa collection ; on joue sur la table du site (ou on le copie dans TCG Arena). */
import { type FormEvent, useEffect, useState } from "react";
import { ImageCarte } from "../composants/image-carte";
import { appelerApi } from "../outils/appels-api";
import type { Carte } from "../outils/libelles-cartes";
import { NOMBRE_RUNES, NOMBRE_TERRAINS, TAILLE_PRINCIPAL } from "../outils/decks";
import { formaterDate, naviguer } from "../outils/navigation";
import type { InfoPartie } from "../outils/table";

interface ResumeDeck {
  id: number;
  nom: string;
  modifieLe: number;
  legende: Carte | null;
  valide: boolean;
  compteurs: { principal: number; runes: number; terrains: number };
  /** Deck de démo prêté à tout le monde : jouable sans posséder les cartes, non modifiable. */
  demo?: boolean;
  export?: string;
}

export function PageDecks() {
  const [decks, setDecks] = useState<ResumeDeck[] | null>(null);
  const [max, setMax] = useState(20);
  const [nom, setNom] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    appelerApi<{ decks: ResumeDeck[]; max: number }>("GET", "/decks").then(
      (r) => {
        setDecks(r.decks);
        setMax(r.max);
      },
      (e: Error) => setErreur(e.message),
    );
  }, []);

  function creer(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    appelerApi<{ id: number }>("POST", "/decks", { nom: nom.trim() || "Nouveau deck" }).then(
      (r) => naviguer(`/decks/${r.id}`),
      (err: Error) => {
        setErreur(err.message);
        setEnCours(false);
      },
    );
  }

  const ouvrir = (id: number) => naviguer(`/decks/${id}`);

  return (
    <main className="conteneur">
      <header className="entete">
        <h1>Jouer</h1>
      </header>

      {decks && <PanneauParties decks={decks} />}

      <a
        href="/minijeux"
        className="raccourci encart-minijeux"
        onClick={(e) => {
          e.preventDefault();
          naviguer("/minijeux");
        }}
      >
        <span className="raccourci-icone" aria-hidden="true">
          ?
        </span>
        <span className="raccourci-texte">
          <strong>Mini-jeux</strong>
          <span>Devine le champion du jour (3 modes) et joue au Memory pour gagner des éclats 💎.</span>
        </span>
        <span className="raccourci-fleche" aria-hidden="true">
          →
        </span>
      </a>

      <h2 className="titre-section">Mes decks</h2>
      <section className="carte pile-serree">
        <p className="aide">
          Construis un deck avec les cartes de ta collection, puis joue-le sur la table du site (ou copie-le dans TCG Arena).
        </p>
        <form className="creation-deck" onSubmit={creer}>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            maxLength={40}
            placeholder="Nom du deck (ex. Ekko tempo)"
            aria-label="Nom du nouveau deck"
          />
          <button type="submit" disabled={enCours || (decks !== null && decks.filter((d) => !d.demo).length >= max)}>
            Créer un deck
          </button>
        </form>
        {decks !== null && decks.filter((d) => !d.demo).length >= max && <p className="aide">Tu as atteint {max} decks : supprimes-en un pour en créer un autre.</p>}
      </section>

      {erreur && <p className="message-erreur">{erreur}</p>}
      {!decks && !erreur && <p className="aide">Chargement…</p>}
      {decks && decks.every((d) => d.demo) && <p className="aide">Tu n'as pas encore construit de deck : joue avec un deck de démo en attendant.</p>}

      <section className="liste-decks">
        {decks?.filter((d) => d.demo).map((d) => (
          <div key={d.id} className="carte resume-deck resume-deck-demo">
            {d.legende ? (
              <ImageCarte image={d.legende.image} largeur={300} alt="" className="miniature" paresseuse />
            ) : (
              <span className="miniature miniature-vide" aria-hidden="true" />
            )}
            <span className="resume-deck-infos">
              <strong>{d.nom}</strong>
              <span className="aide">Prêté à tout le monde pour tester la table de jeu, sans avoir les cartes.</span>
              {d.export && (
                <details>
                  <summary>Voir la liste</summary>
                  <pre className="liste-export">{d.export}</pre>
                </details>
              )}
            </span>
            <span className="etat-deck etat-deck-demo">Deck de démo</span>
          </div>
        ))}
        {decks?.filter((d) => !d.demo).map((d) => (
          <a
            key={d.id}
            className="carte resume-deck"
            href={`/decks/${d.id}`}
            onClick={(e) => {
              e.preventDefault();
              ouvrir(d.id);
            }}
          >
            {d.legende ? (
              <ImageCarte image={d.legende.image} largeur={300} alt="" className="miniature" paresseuse />
            ) : (
              <span className="miniature miniature-vide" aria-hidden="true" />
            )}
            <span className="resume-deck-infos">
              <strong>{d.nom}</strong>
              <span className="aide">
                {d.compteurs.principal}/{TAILLE_PRINCIPAL} cartes · {d.compteurs.runes}/{NOMBRE_RUNES} runes · {d.compteurs.terrains}/
                {NOMBRE_TERRAINS} champs de bataille
              </span>
              <span className="aide">Modifié le {formaterDate(d.modifieLe)}</span>
            </span>
            <span className={d.valide ? "etat-deck etat-deck-valide" : "etat-deck"}>{d.valide ? "Prêt à jouer" : "Incomplet"}</span>
          </a>
        ))}
      </section>
    </main>
  );
}

/** Mes parties : créer (avec un deck prêt), rejoindre avec un code, reprendre une partie en cours. */
function PanneauParties({ decks }: { decks: ResumeDeck[] }) {
  const jouables = decks.filter((d) => d.valide);
  const [parties, setParties] = useState<InfoPartie[]>([]);
  const [deck, setDeck] = useState(String(jouables[0]?.id ?? ""));
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    appelerApi<{ parties: InfoPartie[] }>("GET", "/parties").then((r) => setParties(r.parties), (e: Error) => setErreur(e.message));
  }, []);

  function creer() {
    appelerApi<{ code: string }>("POST", "/parties", { deck: Number(deck) }).then((r) => naviguer(`/table/${r.code}`), (e: Error) => setErreur(e.message));
  }
  function rejoindre(e: FormEvent) {
    e.preventDefault();
    const propre = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (propre.length === 8) naviguer(`/table/${propre}`);
    else setErreur("Le code d'une partie fait 8 caractères.");
  }

  return (
    <section className="carte pile-serree panneau-parties">
      <h2>Table de jeu</h2>
      <p className="aide">Joue en direct contre un ami avec un de tes decks prêts à jouer. Tu déplaces toi-même tes cartes, comme sur une vraie table.</p>
      <div className="encart-apprendre">
        <strong>Nouveau sur Riftbound ?</strong>{" "}
        <a
          href="/tutoriel"
          onClick={(e) => {
            e.preventDefault();
            naviguer("/tutoriel");
          }}
        >
          Joue une partie guidée contre l'ordinateur →
        </a>{" "}
        ou{" "}
        <a
          href="/apprendre"
          onClick={(e) => {
            e.preventDefault();
            naviguer("/apprendre");
          }}
        >
          lis les règles en 5 minutes
        </a>
        .
      </div>
      <div className="parties-actions">
        <div className="pile-serree">
          <span className="surtitre">Nouvelle partie</span>
          {jouables.length === 0 ? (
            <p className="aide">Il te faut d'abord un deck prêt à jouer (ci-dessous).</p>
          ) : (
            <div className="creation-deck">
              <select value={deck} onChange={(e) => setDeck(e.target.value)} aria-label="Deck pour la nouvelle partie">
                {jouables.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom}
                  </option>
                ))}
              </select>
              <button onClick={creer} disabled={!deck}>
                Créer une partie
              </button>
            </div>
          )}
        </div>
        <form className="pile-serree" onSubmit={rejoindre}>
          <span className="surtitre">Rejoindre avec un code</span>
          <div className="creation-deck">
            <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} placeholder="ex. K7MQ2XPA" aria-label="Code de la partie" />
            <button type="submit" className="secondaire">
              Rejoindre
            </button>
          </div>
        </form>
      </div>
      {erreur && <p className="message-erreur">{erreur}</p>}
      {parties.length > 0 && (
        <ul className="liste-parties">
          {parties.map((p) => (
            <li key={p.code}>
              <span>
                <strong>{p.code}</strong> · {p.invite ? `${p.createur} contre ${p.invite}` : `${p.createur}, en attente d'un adversaire`}
              </span>
              <button className="petit" onClick={() => naviguer(`/table/${p.code}`)}>
                {p.statut === "en_cours" ? "Reprendre" : "Ouvrir"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
