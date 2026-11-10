/**
 * Table de jeu /table/:code. Trois états : en attente (le créateur partage le code ; un ami choisit son deck et
 * rejoint), en cours (le plateau, en direct), terminée. Table libre : on déplace soi-même ses cartes.
 * Un clic sur une carte ouvre ses actions (jouer, déplacer, incliner, marqueurs…) ; un clic sur une pile agit dessus.
 */
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { ImageCarte } from "../composants/image-carte";
import { appelerApi } from "../outils/appels-api";
import type { Carte } from "../outils/libelles-cartes";
import { naviguer } from "../outils/navigation";
import {
  type ActionTable,
  type CarteVue,
  type IndexJoueur,
  type InfoPartie,
  type VueTable,
  cartesZone,
  nombreZone,
  texteJournal,
  useCartesTable,
  useSalle,
} from "../outils/table";

interface DeckJouable {
  id: number;
  nom: string;
  valide: boolean;
}

export function PageTable({ code }: { code: string }) {
  const [info, setInfo] = useState<InfoPartie | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // En attente : on relit le salon toutes les 3 secondes pour voir arriver l'adversaire.
  useEffect(() => {
    let arrete = false;
    const lire = () =>
      appelerApi<InfoPartie>("GET", `/parties/${code}`).then(
        (i) => {
          if (!arrete) setInfo(i);
        },
        (e: Error) => setErreur(e.message),
      );
    void lire();
    const minuteur = window.setInterval(() => {
      if (info?.statut === "attente") void lire();
    }, 3000);
    return () => {
      arrete = true;
      window.clearInterval(minuteur);
    };
  }, [code, info?.statut]);

  if (erreur && !info) {
    return (
      <main className="conteneur">
        <p className="message-erreur">{erreur}</p>
        <button className="secondaire" onClick={() => naviguer("/jouer")}>
          Retour
        </button>
      </main>
    );
  }
  if (!info) return <main className="conteneur"><p className="aide">Chargement…</p></main>;
  if (info.statut === "terminee") {
    return (
      <main className="conteneur conteneur-etroit">
        <section className="carte pile-serree">
          <h1>Partie terminée</h1>
          <button onClick={() => naviguer("/jouer")}>Retour à « Jouer »</button>
        </section>
      </main>
    );
  }
  if (info.statut === "attente") return <SalonAttente info={info} surRejoint={() => setInfo({ ...info, statut: "en_cours" })} />;
  if (info.moi === null) {
    return (
      <main className="conteneur conteneur-etroit">
        <p className="aide">Cette partie a déjà commencé entre {info.createur} et {info.invite}.</p>
      </main>
    );
  }
  return <Plateau code={code} />;
}

/** En attente : le créateur partage le code ; un autre joueur choisit un deck valide et rejoint. */
function SalonAttente({ info, surRejoint }: { info: InfoPartie; surRejoint: () => void }) {
  const [decks, setDecks] = useState<DeckJouable[]>([]);
  const [deck, setDeck] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const lien = `${location.origin}/table/${info.code}`;

  useEffect(() => {
    if (info.moi === 0) return;
    appelerApi<{ decks: DeckJouable[] }>("GET", "/decks").then((r) => {
      const jouables = r.decks.filter((d) => d.valide);
      setDecks(jouables);
      setDeck(String(jouables[0]?.id ?? ""));
    }, (e: Error) => setErreur(e.message));
  }, [info.moi]);

  function rejoindre(e: FormEvent) {
    e.preventDefault();
    appelerApi("POST", `/parties/${info.code}/rejoindre`, { deck: Number(deck) }).then(surRejoint, (err: Error) => setErreur(err.message));
  }

  return (
    <main className="conteneur conteneur-etroit">
      <section className="carte pile-serree salon-attente">
        <h1>Partie {info.code}</h1>
        {info.moi === 0 ? (
          <>
            <p>En attente d'un adversaire… Envoie-lui ce lien (ou le code) :</p>
            <p className="code-partie">{info.code}</p>
            <button
              onClick={() =>
                void navigator.clipboard.writeText(lien).then(() => {
                  setCopie(true);
                  setTimeout(() => setCopie(false), 2500);
                })
              }
            >
              {copie ? "Lien copié !" : "Copier le lien"}
            </button>
            <button
              className="secondaire"
              onClick={() => appelerApi("DELETE", `/parties/${info.code}`).then(() => naviguer("/jouer"), (e: Error) => setErreur(e.message))}
            >
              Annuler la partie
            </button>
          </>
        ) : (
          <form className="pile-serree" onSubmit={rejoindre}>
            <p>
              <strong>{info.createur}</strong> t'attend. Choisis ton deck :
            </p>
            {decks.length === 0 ? (
              <p className="aide">
                Aucun deck prêt à jouer.{" "}
                <a href="/jouer" onClick={(e) => { e.preventDefault(); naviguer("/jouer"); }}>
                  Construis-en un
                </a>
                .
              </p>
            ) : (
              <select value={deck} onChange={(e) => setDeck(e.target.value)} aria-label="Mon deck">
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom}
                  </option>
                ))}
              </select>
            )}
            <button type="submit" disabled={!deck}>
              Rejoindre la partie
            </button>
          </form>
        )}
        {erreur && <p className="message-erreur">{erreur}</p>}
      </section>
    </main>
  );
}

// ---------- Plateau ----------

interface Selection {
  carte: CarteVue;
  zone: string;
}

/** Où est cette carte maintenant (null si elle n'est plus visible, par exemple remise dans le deck) ? */
function retrouverCarte(vue: VueTable, id: string): Selection | null {
  for (const [zone, z] of Object.entries(vue.zones)) {
    if (!Array.isArray(z)) continue;
    const carte = z.find((c) => c.id === id);
    if (carte) return { carte, zone };
  }
  return null;
}

const NOM_CARTE = (c: Carte | undefined) => (c ? (c.sousTitre ? `${c.nom}, ${c.sousTitre}` : c.nom) : "Carte cachée");

function Plateau({ code }: { code: string }) {
  const { vue, etat, erreur, effacerErreur, envoyer } = useSalle(code, true);

  if (etat === "terminee") {
    return (
      <main className="conteneur conteneur-etroit">
        <section className="carte pile-serree">
          <h1>Partie terminée</h1>
          <p>Un des joueurs a quitté la partie.</p>
          <button onClick={() => naviguer("/jouer")}>Retour à « Jouer »</button>
        </section>
      </main>
    );
  }
  if (!vue || vue.moi === null) {
    return <main className="conteneur"><p className="aide">{etat === "deconnecte" ? "Connexion perdue, reconnexion…" : "Connexion à la table…"}</p></main>;
  }

  function quitter() {
    if (!window.confirm("Quitter la partie ? Elle sera terminée pour les deux joueurs.")) return;
    appelerApi("DELETE", `/parties/${code}`).then(() => naviguer("/jouer"), () => naviguer("/jouer"));
  }

  return (
    <PlateauTable
      vue={vue}
      moi={vue.moi}
      envoyer={envoyer}
      erreur={erreur}
      effacerErreur={effacerErreur}
      statut={<span className={`table-connexion table-connexion-${etat}`}>{etat === "connecte" ? "En direct" : "Reconnexion…"}</span>}
      surQuitter={quitter}
    />
  );
}

/**
 * Le plateau lui-même, sans connexion : partie en ligne (Plateau) ou partie solo du tutoriel (page-tutoriel.tsx).
 * `envoyer` transmet l'action (à la salle, ou au moteur local) ; `enfants` s'affiche par-dessus (panneau du tutoriel).
 */
export function PlateauTable({
  vue,
  moi,
  envoyer,
  erreur,
  effacerErreur,
  statut,
  surQuitter,
  libelleQuitter = "Quitter",
  sansMulligan,
  enfants,
}: {
  vue: VueTable;
  moi: IndexJoueur;
  envoyer: (action: ActionTable) => void;
  erreur: string | null;
  effacerErreur: () => void;
  statut: ReactNode;
  surQuitter: () => void;
  libelleQuitter?: string;
  /** Masque le bouton « Mulligan » (le tutoriel s'en charge). */
  sansMulligan?: boolean;
  enfants?: ReactNode;
}) {
  const cartes = useCartesTable(vue);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pile, setPile] = useState<{ zone: string; titre: string } | null>(null);
  const [mulligan, setMulligan] = useState<string[] | null>(null);
  const [message, setMessage] = useState("");
  const [journalOuvert, setJournalOuvert] = useState(false);
  const [choixToken, setChoixToken] = useState(false);

  // La carte sélectionnée a pu bouger (ou disparaître) : on suit sa nouvelle position.
  const selectionActuelle = selection ? retrouverCarte(vue, selection.carte.id) : null;

  const lui = (1 - moi) as IndexJoueur;
  const jouer = (action: ActionTable) => {
    envoyer(action);
  };
  const choisir = (carte: CarteVue, zone: string) => {
    if (mulligan && zone === `${moi}.main`) {
      setMulligan(mulligan.includes(carte.id) ? mulligan.filter((id) => id !== carte.id) : mulligan.length < 2 ? [...mulligan, carte.id] : mulligan);
      return;
    }
    setSelection({ carte, zone });
  };
  const propsCarte = { cartes, selection: selectionActuelle?.carte.id ?? null, mulligan, surChoix: choisir };

  return (
    <main className="table-jeu">
      <header className="table-entete">
        <button className="secondaire petit" onClick={() => naviguer("/jouer")}>
          ←
        </button>
        <Score vue={vue} j={lui} />
        {statut}
        <a className="table-regles" href="/apprendre" target="_blank" rel="noopener">
          Règles
        </a>
        <Score vue={vue} j={moi} surPoints={(delta) => jouer({ type: "points", delta })} />
        <button className="secondaire petit" onClick={surQuitter}>
          {libelleQuitter}
        </button>
      </header>

      {erreur && (
        <p className="avis-deck table-avis" role="status" onClick={effacerErreur}>
          {erreur}
        </p>
      )}

      <div className="table-corps">
        <div className="table-plateau">
          <MainCachee nombre={nombreZone(vue, `${lui}.main`)} pseudo={vue.joueurs[lui].pseudo} />
          <CoteJoueur vue={vue} j={lui} adverse {...propsCarte} surPile={(zone, titre) => setPile({ zone, titre })} />

          <section className="table-champs">
            {[0, 1].map((n) => (
              <ChampDeBataille key={n} vue={vue} n={n} moi={moi} {...propsCarte} />
            ))}
          </section>

          <CoteJoueur
            vue={vue}
            j={moi}
            {...propsCarte}
            surPile={(zone, titre) => setPile({ zone, titre })}
            surPiocher={() => jouer({ type: "piocher", n: 1 })}
            surCanaliser={() => jouer({ type: "canaliser", n: 1 })}
          />

          <section className="table-main" aria-label="Ma main">
            <div className="table-main-actions">
              {mulligan ? (
                <>
                  <span className="aide">Mulligan : choisis jusqu'à 2 cartes à changer ({mulligan.length}/2)</span>
                  <button
                    className="petit"
                    onClick={() => {
                      jouer({ type: "mulligan", cartes: mulligan });
                      setMulligan(null);
                    }}
                  >
                    Valider
                  </button>
                  <button className="secondaire petit" onClick={() => setMulligan(null)}>
                    Annuler
                  </button>
                </>
              ) : (
                <>
                  <span className="aide">Ma main ({nombreZone(vue, `${moi}.main`)})</span>
                  {!vue.mulliganFait[moi] && !sansMulligan && (
                    <button className="secondaire petit" onClick={() => setMulligan([])}>
                      Mulligan
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="table-rangee table-rangee-main">
              {cartesZone(vue, `${moi}.main`).map((c) => (
                <CarteTable key={c.id} carte={c} zone={`${moi}.main`} grande {...propsCarte} />
              ))}
            </div>
          </section>

          <div className="table-commandes">
            <button className="secondaire petit" onClick={() => jouer({ type: "piocher", n: 1 })}>
              Piocher
            </button>
            <button className="secondaire petit" onClick={() => jouer({ type: "canaliser", n: 1 })}>
              Canaliser une rune
            </button>
            <button className="secondaire petit" onClick={() => jouer({ type: "redresser" })}>
              Tout redresser
            </button>
            <button className="secondaire petit" onClick={() => jouer({ type: "melanger", zone: "deck" })}>
              Mélanger mon deck
            </button>
            <button className="secondaire petit" onClick={() => setChoixToken(true)}>
              Créer un token
            </button>
            <button className="secondaire petit" onClick={() => jouer({ type: "de" })}>
              Lancer un dé
            </button>
            <button className="secondaire petit table-bouton-journal" onClick={() => setJournalOuvert(!journalOuvert)}>
              {journalOuvert ? "Masquer le journal" : "Journal"}
            </button>
          </div>
        </div>

        <aside className={journalOuvert ? "table-journal ouvert" : "table-journal"} aria-label="Journal de la partie">
          <h2>Journal</h2>
          <ol className="table-journal-liste">
            {[...vue.journal].reverse().map((e, i) => (
              <li key={`${e.t}-${i}`} className={e.j === null ? "journal-table" : e.j === moi ? "journal-moi" : "journal-lui"}>
                {texteJournal(e, cartes)}
              </li>
            ))}
          </ol>
          <form
            className="table-message"
            onSubmit={(e) => {
              e.preventDefault();
              if (!message.trim()) return;
              jouer({ type: "dire", texte: message.trim() });
              setMessage("");
            }}
          >
            <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} placeholder="Message…" aria-label="Message" />
            <button type="submit" className="petit">
              Envoyer
            </button>
          </form>
        </aside>
      </div>

      {selectionActuelle && (
        <PanneauCarte
          vue={vue}
          moi={moi}
          selection={selectionActuelle}
          carte={selectionActuelle.carte.code ? cartes[selectionActuelle.carte.code] : undefined}
          jouer={jouer}
          surFermer={() => setSelection(null)}
        />
      )}
      {choixToken && <ChoixToken vue={vue} moi={moi} cartes={cartes} jouer={jouer} surFermer={() => setChoixToken(false)} />}
      {pile && (
        <VoirPile
          vue={vue}
          zone={pile.zone}
          titre={pile.titre}
          cartes={cartes}
          surChoix={(c) => {
            setPile(null);
            setSelection({ carte: c, zone: pile.zone });
          }}
          surFermer={() => setPile(null)}
        />
      )}
      {enfants}
    </main>
  );
}

function Score({ vue, j, surPoints }: { vue: VueTable; j: IndexJoueur; surPoints?: (delta: number) => void }) {
  return (
    <div className={j === vue.moi ? "table-score table-score-moi" : "table-score"}>
      <span className="table-pseudo">
        {vue.joueurs[j].pseudo}
        {vue.premier === j && <small title="Commence la partie"> ★</small>}
      </span>
      {surPoints && (
        <button className="bouton-icone" onClick={() => surPoints(-1)} aria-label="Retirer un point">
          −
        </button>
      )}
      <strong aria-label={`${vue.joueurs[j].points} points`}>{vue.joueurs[j].points}</strong>
      {surPoints && (
        <button className="bouton-icone" onClick={() => surPoints(1)} aria-label="Ajouter un point">
          +
        </button>
      )}
    </div>
  );
}

interface PropsCartes {
  cartes: Record<string, Carte>;
  selection: string | null;
  mulligan: string[] | null;
  surChoix: (c: CarteVue, zone: string) => void;
}

function CarteTable({ carte, zone, grande, cartes, selection, mulligan, surChoix }: PropsCartes & { carte: CarteVue; zone: string; grande?: boolean }) {
  const infos = carte.code ? cartes[carte.code] : undefined;
  const paysage = infos?.orientation === "paysage";
  const classes = [
    "carte-table",
    grande ? "carte-table-grande" : "",
    paysage ? "carte-table-paysage" : "",
    carte.inclinee ? "carte-table-inclinee" : "",
    selection === carte.id ? "carte-table-choisie" : "",
    mulligan?.includes(carte.id) ? "carte-table-mulligan" : "",
  ].join(" ");
  const nom = carte.libelle ? `Token ${carte.libelle}` : NOM_CARTE(infos);
  return (
    <button className={classes} onClick={() => surChoix(carte, zone)} title={nom} aria-label={nom}>
      {carte.libelle ? <TokenLibre libelle={carte.libelle} /> : infos ? <ImageCarte image={infos.image} largeur={300} alt="" /> : <DosCarte />}
      {carte.token && <span className="carte-table-token">Token</span>}
      {!carte.face && carte.code && !zone.endsWith(".main") && <span className="carte-table-cachee">Face cachée</span>}
      {carte.marqueurs !== 0 && <span className="carte-table-marqueurs">{carte.marqueurs > 0 ? `+${carte.marqueurs}` : carte.marqueurs}</span>}
    </button>
  );
}

/** Token libre (Bomb…) : pas d'image dans les données, on affiche son nom. */
function TokenLibre({ libelle }: { libelle: string }) {
  return (
    <span className="token-libre">
      <span>{libelle}</span>
    </span>
  );
}

/** Créer un ou plusieurs tokens : un token du jeu (avec son image) ou un token libre par son nom. */
function ChoixToken({
  vue,
  moi,
  cartes,
  jouer,
  surFermer,
}: {
  vue: VueTable;
  moi: IndexJoueur;
  cartes: Record<string, Carte>;
  jouer: (a: ActionTable) => void;
  surFermer: () => void;
}) {
  const [vers, setVers] = useState(`${moi}.base`);
  const [n, setN] = useState(1);
  const [libelle, setLibelle] = useState("");
  // Un seul exemplaire par nom (Gold, Sprite, Recruit… existent dans plusieurs sets).
  const vus = new Set<string>();
  const tokens = vue.tokens.filter((code) => {
    const nom = cartes[code]?.nom ?? code;
    if (vus.has(nom)) return false;
    vus.add(nom);
    return true;
  });
  const creer = (choix: { code: string } | { libelle: string }) => {
    jouer({ type: "creerToken", ...choix, vers, n });
    surFermer();
  };
  return (
    <div className="fond-modale" onClick={surFermer}>
      <div className="modale pile-serree" role="dialog" aria-label="Créer un token" onClick={(e) => e.stopPropagation()}>
        <h2>Créer un token</h2>
        <div className="actions-ligne">
          <label>
            Où ?{" "}
            <select value={vers} onChange={(e) => setVers(e.target.value)}>
              <option value={`${moi}.base`}>Ma base</option>
              <option value="champ.0">Champ de bataille 1</option>
              <option value="champ.1">Champ de bataille 2</option>
            </select>
          </label>
          <label>
            Combien ?{" "}
            <select value={n} onChange={(e) => setN(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </div>
        {tokens.length > 0 && <p className="aide">Clique sur un token du jeu :</p>}
        <div className="grille-cartes grille-compacte">
          {tokens.map((code) => {
            const c = cartes[code];
            return (
              <button key={code} className="vignette-carte" onClick={() => creer({ code })} title={c ? NOM_CARTE(c) : code}>
                <span className="cadre-carte">
                  {c ? <ImageCarte className={c.orientation === "paysage" ? "image-paysage" : undefined} image={c.image} largeur={300} alt={c.nom} /> : <DosCarte />}
                </span>
                <span className="legende-carte">{c?.nom ?? code}</span>
              </button>
            );
          })}
        </div>
        <form
          className="creation-deck"
          onSubmit={(e) => {
            e.preventDefault();
            if (libelle.trim()) creer({ libelle: libelle.trim() });
          }}
        >
          <input value={libelle} onChange={(e) => setLibelle(e.target.value)} maxLength={30} placeholder="Autre token (ex. Bomb)" aria-label="Nom d'un autre token" />
          <button type="submit" className="secondaire" disabled={!libelle.trim()}>
            Créer
          </button>
        </form>
        <button className="petit" onClick={surFermer}>
          Fermer
        </button>
      </div>
    </div>
  );
}

/** Dos de carte du site (dessin original). */
function DosCarte() {
  return (
    <span className="dos-carte" aria-hidden="true">
      <span>R</span>
    </span>
  );
}

function MainCachee({ nombre, pseudo }: { nombre: number; pseudo: string }) {
  return (
    <div className="table-main-adverse" aria-label={`Main de ${pseudo} : ${nombre} cartes`}>
      {Array.from({ length: Math.min(nombre, 12) }, (_, i) => (
        <span key={i} className="carte-table carte-table-mini">
          <DosCarte />
        </span>
      ))}
      <span className="aide">{nombre} en main</span>
    </div>
  );
}

function Pile({ titre, nombre, dessus, cartes, surClic }: { titre: string; nombre: number; dessus?: CarteVue; cartes: Record<string, Carte>; surClic?: () => void }) {
  const infos = dessus?.code ? cartes[dessus.code] : undefined;
  return (
    <button className="table-pile" onClick={surClic} disabled={!surClic} title={titre}>
      <span className="carte-table">
        {infos ? <ImageCarte image={infos.image} largeur={300} alt="" /> : nombre > 0 ? <DosCarte /> : <span className="pile-vide" />}
      </span>
      <span className="table-pile-legende">
        {titre} <strong>{nombre}</strong>
      </span>
    </button>
  );
}

function CoteJoueur({
  vue,
  j,
  adverse,
  surPile,
  surPiocher,
  surCanaliser,
  ...props
}: PropsCartes & {
  vue: VueTable;
  j: IndexJoueur;
  adverse?: boolean;
  surPile: (zone: string, titre: string) => void;
  surPiocher?: () => void;
  surCanaliser?: () => void;
}) {
  const z = (nom: string) => `${j}.${nom}`;
  const rangee = (nom: string) =>
    cartesZone(vue, z(nom)).map((c) => <CarteTable key={c.id} carte={c} zone={z(nom)} {...props} />);
  const defausse = cartesZone(vue, z("defausse"));
  const bannis = cartesZone(vue, z("bannis"));
  const pseudo = vue.joueurs[j].pseudo;
  return (
    <section className={adverse ? "table-cote table-cote-adverse" : "table-cote"} aria-label={adverse ? `Côté de ${pseudo}` : "Mon côté"}>
      <div className="table-zone table-zone-identite">
        <span className="table-zone-titre">Légende et champion</span>
        <div className="table-rangee">
          {rangee("legende")}
          {rangee("champion")}
        </div>
      </div>
      <div className="table-zone table-zone-base">
        <span className="table-zone-titre">Base</span>
        <div className="table-rangee">{rangee("base")}</div>
      </div>
      <div className="table-zone table-zone-reserve">
        <span className="table-zone-titre">Runes ({nombreZone(vue, z("reserve"))})</span>
        <div className="table-rangee table-rangee-serree">{rangee("reserve")}</div>
      </div>
      <div className="table-zone table-zone-piles">
        <Pile titre="Deck" nombre={nombreZone(vue, z("deck"))} cartes={props.cartes} surClic={surPiocher} />
        <Pile titre="Runes" nombre={nombreZone(vue, z("runes"))} cartes={props.cartes} surClic={surCanaliser} />
        <Pile titre="Défausse" nombre={defausse.length} dessus={defausse.at(-1)} cartes={props.cartes} surClic={() => surPile(z("defausse"), `Défausse de ${pseudo}`)} />
        <Pile titre="Bannies" nombre={bannis.length} dessus={bannis.at(-1)} cartes={props.cartes} surClic={() => surPile(z("bannis"), `Cartes bannies de ${pseudo}`)} />
        {nombreZone(vue, z("terrains")) > 0 && (
          <Pile
            titre="Champs dispo"
            nombre={nombreZone(vue, z("terrains"))}
            dessus={cartesZone(vue, z("terrains"))[0]}
            cartes={props.cartes}
            surClic={() => surPile(z("terrains"), `Champs de bataille de ${pseudo}`)}
          />
        )}
      </div>
    </section>
  );
}

function ChampDeBataille({ vue, n, moi, ...props }: PropsCartes & { vue: VueTable; n: number; moi: IndexJoueur }) {
  const zone = `champ.${n}`;
  const toutes = cartesZone(vue, zone);
  const terrains = toutes.filter((c) => c.code && props.cartes[c.code]?.type === "Battlefield");
  const unites = toutes.filter((c) => !terrains.includes(c));
  const groupe = (j: IndexJoueur) => unites.filter((c) => c.proprio === j).map((c) => <CarteTable key={c.id} carte={c} zone={zone} {...props} />);
  return (
    <div className="table-champ" aria-label={`Champ de bataille ${n + 1}`}>
      <div className="table-rangee table-champ-lui">{groupe((1 - moi) as IndexJoueur)}</div>
      <div className="table-champ-terrain">
        {terrains.length ? terrains.map((c) => <CarteTable key={c.id} carte={c} zone={zone} {...props} />) : <span className="aide">Champ de bataille {n + 1}</span>}
      </div>
      <div className="table-rangee table-champ-moi">{groupe(moi)}</div>
    </div>
  );
}

/** Actions sur la carte choisie : déplacer vers une zone de son propriétaire, incliner, marqueurs, retourner, révéler. */
function PanneauCarte({
  vue,
  moi,
  selection,
  carte,
  jouer,
  surFermer,
}: {
  vue: VueTable;
  moi: IndexJoueur;
  selection: Selection;
  carte: Carte | undefined;
  jouer: (a: ActionTable) => void;
  surFermer: () => void;
}) {
  const [cachee, setCachee] = useState(false);
  const { carte: c, zone } = selection;
  const p = c.proprio;
  const aMoi = p === moi;
  const enJeu = !/\.(main|deck|runes|defausse|bannis)$/.test(zone);
  const deplacer = (vers: string, position?: "dessus" | "dessous") => {
    jouer({ type: "deplacer", carte: c.id, vers, ...(position ? { position } : {}), ...(cachee && aMoi ? { cachee: true } : {}) });
    surFermer();
  };
  const destinations: Array<[string, string, ("dessus" | "dessous")?]> = [
    [`${p}.main`, "Main"],
    [`${p}.base`, "Base"],
    ["champ.0", "Champ de bataille 1"],
    ["champ.1", "Champ de bataille 2"],
    [`${p}.reserve`, "Réserve de runes"],
    [`${p}.defausse`, "Défausse"],
    [`${p}.bannis`, "Bannir"],
    [`${p}.deck`, "Dessus du deck", "dessus"],
    [`${p}.deck`, "Dessous du deck", "dessous"],
    [`${p}.runes`, "Sous le deck de runes", "dessous"],
    [`${p}.champion`, "Zone de champion"],
  ];
  // Les cartes de l'adversaire : seulement si elles sont visibles en jeu (incliner, marqueurs, détruire…).
  const autorise = aMoi || (c.face && enJeu) || zone.endsWith(".defausse") || zone.endsWith(".bannis");

  const titre = c.libelle ? `Token ${c.libelle}` : NOM_CARTE(carte);
  return (
    <div className="fond-modale" onClick={surFermer}>
      <div className="modale panneau-carte-table" role="dialog" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <div className="panneau-carte-image">
          {c.libelle ? <TokenLibre libelle={c.libelle} /> : carte ? <ImageCarte image={carte.image} largeur={744} alt={carte.nom} /> : <DosCarte />}
        </div>
        <div className="panneau-carte-actions">
          <h2>{titre}</h2>
          {carte?.texte && <p className="aide panneau-carte-texte">{carte.texte}</p>}
          {c.token && <p className="aide">Token : il disparaît s'il quitte le jeu (défausse, main, deck, bannissement).</p>}
          {!autorise ? (
            <p className="aide">Carte de {vue.joueurs[p].pseudo} : tu ne peux pas la manipuler ici.</p>
          ) : (
            <>
              {enJeu && (
                <div className="actions-ligne">
                  <button className="petit" onClick={() => jouer({ type: "incliner", carte: c.id })}>
                    {c.inclinee ? "Redresser" : "Incliner"}
                  </button>
                  <button className="secondaire petit" onClick={() => jouer({ type: "marqueur", carte: c.id, delta: -1 })}>
                    − marqueur
                  </button>
                  <button className="secondaire petit" onClick={() => jouer({ type: "marqueur", carte: c.id, delta: 1 })}>
                    + marqueur
                  </button>
                  {aMoi && (
                    <button className="secondaire petit" onClick={() => jouer({ type: "retourner", carte: c.id })}>
                      {c.face ? "Mettre face cachée" : "Retourner face visible"}
                    </button>
                  )}
                </div>
              )}
              {aMoi && zone === `${moi}.main` && (
                <div className="actions-ligne">
                  <button className="secondaire petit" onClick={() => { jouer({ type: "reveler", carte: c.id }); surFermer(); }}>
                    Révéler à l'adversaire
                  </button>
                  <label className="bascule">
                    <input type="checkbox" checked={cachee} onChange={(e) => setCachee(e.target.checked)} /> Jouer face cachée
                  </label>
                </div>
              )}
              <p className="aide">Déplacer vers :</p>
              <div className="panneau-carte-destinations">
                {destinations
                  .filter(([vers, , position]) => vers !== zone || position)
                  .map(([vers, libelle, position]) => (
                    <button key={`${vers}-${position ?? ""}`} className="secondaire petit" onClick={() => deplacer(vers, position)}>
                      {libelle}
                    </button>
                  ))}
              </div>
            </>
          )}
          <button className="petit" onClick={surFermer}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function VoirPile({
  vue,
  zone,
  titre,
  cartes,
  surChoix,
  surFermer,
}: {
  vue: VueTable;
  zone: string;
  titre: string;
  cartes: Record<string, Carte>;
  surChoix: (c: CarteVue) => void;
  surFermer: () => void;
}) {
  const liste = [...cartesZone(vue, zone)].reverse();
  return (
    <div className="fond-modale" onClick={surFermer}>
      <div className="modale" role="dialog" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <h2>{titre}</h2>
        {liste.length === 0 && <p className="aide">Vide.</p>}
        <div className="grille-cartes grille-compacte">
          {liste.map((c) => {
            const infos = c.code ? cartes[c.code] : undefined;
            return (
              <button key={c.id} className="vignette-carte" onClick={() => surChoix(c)} title={NOM_CARTE(infos)}>
                <span className="cadre-carte">{infos ? <ImageCarte image={infos.image} largeur={300} alt={infos.nom} /> : <DosCarte />}</span>
              </button>
            );
          })}
        </div>
        <button className="petit" onClick={surFermer}>
          Fermer
        </button>
      </div>
    </div>
  );
}
