/**
 * Marché : annonces « Qui a ? / Qui veut ? » (tableau), salon commun et messages privés.
 * Adresses : /marche (annonces), /marche/salon, /marche/prive, /marche/prive/<pseudo>.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AvatarJoueur, LienJoueur } from "../composants/avatar-joueur";
import { FicheCarte } from "../composants/fiche-carte";
import { FilDiscussion } from "../composants/fil-discussion";
import { FormulaireAnnonce } from "../composants/formulaire-annonce";
import { ImageCarte } from "../composants/image-carte";
import { appelerApi } from "../outils/appels-api";
import { type Carte, classeRarete, type SetInfo } from "../outils/libelles-cartes";
import { type Annonce, type ConversationVue, type SouhaitMarche, heureMessage, LIBELLES_ANNONCE, lienEchangeDepuisAnnonce, type TypeAnnonce } from "../outils/marche";
import { naviguer } from "../outils/navigation";
import { basculerWishlist } from "../outils/wishlist";

type Onglet = "annonces" | "salon" | "prive";

function lireChemin(chemin: string): { onglet: Onglet; avec: string | null } {
  if (chemin.startsWith("/marche/salon")) return { onglet: "salon", avec: null };
  if (chemin.startsWith("/marche/prive")) {
    const avec = decodeURIComponent(chemin.slice("/marche/prive/".length));
    return { onglet: "prive", avec: /^[A-Za-z0-9_-]{3,20}$/.test(avec) ? avec : null };
  }
  return { onglet: "annonces", avec: null };
}

export function PageMarche({ chemin }: { chemin: string }) {
  const { onglet, avec } = lireChemin(chemin);
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [fiche, setFiche] = useState<{ carte: Carte; foil: boolean } | null>(null);

  useEffect(() => {
    appelerApi<{ sets: SetInfo[] }>("GET", "/catalogue/sets").then((r) => setSets(r.sets), () => undefined);
  }, []);

  const ouvrirFiche = useCallback((carte: Carte, foil: boolean) => setFiche({ carte, foil }), []);
  const ecrireA = useCallback((pseudo: string) => naviguer(`/marche/prive/${encodeURIComponent(pseudo)}`), []);
  const nomSet = (code: string) => sets.find((s) => s.code === code)?.nom ?? code.toUpperCase();

  return (
    <main className={`conteneur page-marche ${onglet !== "annonces" ? "page-marche-fil" : ""}`}>
      <header className="entete">
        <h1>Marché</h1>
      </header>
      <nav className="onglets" aria-label="Sections du marché">
        {(
          [
            ["annonces", "Annonces", "/marche"],
            ["salon", "Salon", "/marche/salon"],
            ["prive", "Messages privés", "/marche/prive"],
          ] as const
        ).map(([cle, libelle, lien]) => (
          <button key={cle} className={onglet === cle ? "onglet actif" : "onglet"} onClick={() => naviguer(lien)}>
            {libelle}
          </button>
        ))}
      </nav>

      {onglet === "annonces" && <OngletAnnonces surCarte={ouvrirFiche} surEcrire={ecrireA} />}
      {onglet === "salon" && (
        <section className="carte carte-fil">
          <FilDiscussion
            key="salon"
            source="/marche/salon"
            placeholder="Écris à tout le monde…"
            vide="Personne n'a encore écrit. Lance la discussion !"
            surCarte={ouvrirFiche}
            surMessagePrive={ecrireA}
          />
        </section>
      )}
      {onglet === "prive" && <OngletPrive avec={avec} surCarte={ouvrirFiche} />}

      {fiche && <FicheCarte carte={fiche.carte} nomSet={nomSet(fiche.carte.set)} foil={fiche.foil} surFermeture={() => setFiche(null)} />}
    </main>
  );
}

// ---------- Annonces ----------

function OngletAnnonces({ surCarte, surEcrire }: { surCarte: (c: Carte, foil: boolean) => void; surEcrire: (p: string) => void }) {
  const [annonces, setAnnonces] = useState<Annonce[] | null>(null);
  const [souhaits, setSouhaits] = useState<SouhaitMarche[]>([]);
  const [peutModerer, setPeutModerer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<"tout" | TypeAnnonce | "miennes">("tout");
  const [recherche, setRecherche] = useState("");
  const [jePeuxAider, setJePeuxAider] = useState(false);
  const [formulaire, setFormulaire] = useState(false);

  const charger = useCallback(
    () =>
      appelerApi<{ annonces: Annonce[]; wishlists: SouhaitMarche[]; peutModerer: boolean }>("GET", "/marche/annonces").then(
        (r) => {
          setAnnonces(r.annonces);
          setSouhaits(r.wishlists);
          setPeutModerer(r.peutModerer);
          setErreur(null);
        },
        (e: Error) => setErreur(e.message),
      ),
    [],
  );

  useEffect(() => {
    void charger();
  }, [charger]);

  const visibles = useMemo(() => {
    const mots = recherche.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);
    return (annonces ?? []).filter((a) => {
      if (filtre === "miennes" && !a.estMoi) return false;
      if ((filtre === "cherche" || filtre === "propose") && a.type !== filtre) return false;
      if (jePeuxAider && !(a.type === "cherche" && !a.estMoi && a.jePossede > 0)) return false;
      if (mots.length) {
        const texte = `${a.carte.nom} ${a.auteur} ${a.note ?? ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (!mots.every((m) => texte.includes(m))) return false;
      }
      return true;
    });
  }, [annonces, filtre, recherche, jePeuxAider]);

  // Wishlists : des « Qui a ? » permanents, affichés avec les annonces « Qui a ? ».
  const souhaitsVisibles = useMemo(() => {
    if (filtre === "propose") return [];
    const mots = recherche.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);
    return souhaits.filter((s) => {
      if (filtre === "miennes" && !s.estMoi) return false;
      if (jePeuxAider && !(!s.estMoi && s.jePossede > 0)) return false;
      if (mots.length) {
        const texte = `${s.carte.nom} ${s.auteur}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (!mots.every((m) => texte.includes(m))) return false;
      }
      return true;
    });
  }, [souhaits, filtre, recherche, jePeuxAider]);

  async function retirerSouhait(s: SouhaitMarche) {
    try {
      await basculerWishlist(s.carte.code);
      await charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  async function retirer(a: Annonce) {
    if (!window.confirm(`Retirer l'annonce « ${LIBELLES_ANNONCE[a.type].titre} ${a.carte.nom} » ?`)) return;
    try {
      await appelerApi("DELETE", `/marche/annonces/${a.id}`);
      await charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  return (
    <>
      <section className="carte barre-annonces">
        <div className="barre-annonces-haut">
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher une carte, un joueur…" aria-label="Rechercher" />
          <button onClick={() => setFormulaire(true)}>+ Nouvelle annonce</button>
        </div>
        <div className="choix-sets" role="radiogroup" aria-label="Filtrer les annonces">
          {(
            [
              ["tout", "Tout"],
              ["cherche", "Qui a ?"],
              ["propose", "Qui veut ?"],
              ["miennes", "Mes annonces"],
            ] as const
          ).map(([cle, libelle]) => (
            <button key={cle} type="button" role="radio" aria-checked={filtre === cle} className={filtre === cle ? "puce-set actif" : "puce-set"} onClick={() => setFiltre(cle)}>
              {libelle}
            </button>
          ))}
          <label className="bascule">
            <input type="checkbox" checked={jePeuxAider} onChange={(e) => setJePeuxAider(e.target.checked)} /> J'ai ce qu'ils cherchent
          </label>
        </div>
      </section>

      {erreur && <p className="message-erreur">{erreur}</p>}
      {!annonces && !erreur && <p className="aide">Chargement…</p>}
      {annonces && visibles.length === 0 && souhaitsVisibles.length === 0 && (
        <p className="aide">
          {annonces.length === 0 && souhaits.length === 0 ? "Aucune annonce pour l'instant. Publie la première !" : "Aucune annonce ne correspond à ces filtres."}
        </p>
      )}

      <div className="grille-annonces">
        {visibles.map((a) => (
          <article key={a.id} className={`annonce ${classeRarete(a.carte)}`}>
            <button type="button" className="annonce-image" onClick={() => surCarte(a.carte, a.foil)} title={`Voir ${a.carte.nom}`}>
              <span className={`cadre-carte ${a.foil ? "voile-foil" : ""}`}>
                <ImageCarte image={a.carte.image} largeur={300} alt={a.carte.nom} className={a.carte.orientation === "paysage" ? "image-paysage" : undefined} paresseuse />
              </span>
            </button>
            <div className="annonce-infos">
              <span className={`etiquette-annonce etiquette-${a.type}`}>{LIBELLES_ANNONCE[a.type].titre}</span>
              <h3>
                {a.carte.nom}
                {a.foil && <span className="badge-foil-texte"> Foil</span>}
              </h3>
              <p className="aide">
                {a.estMoi ? "Ton annonce" : <>par <strong><LienJoueur pseudo={a.auteur} /></strong></>} · {heureMessage(a.creeLe)}
              </p>
              {a.note && <p className="annonce-note">« {a.note} »</p>}
              {!a.estMoi && a.type === "cherche" && a.jePossede > 0 && <p className="pastille-info">Tu l'as ×{a.jePossede}</p>}
              {!a.estMoi && a.type === "propose" && a.jePossede > 0 && <p className="aide">Tu en as déjà {a.jePossede}</p>}
              <div className="annonce-actions">
                {!a.estMoi && (
                  <>
                    <button className="petit" onClick={() => naviguer(lienEchangeDepuisAnnonce(a))}>
                      Proposer un échange
                    </button>
                    <button className="petit secondaire" onClick={() => surEcrire(a.auteur)}>
                      Écrire
                    </button>
                  </>
                )}
                {(a.estMoi || peutModerer) && (
                  <button className="petit secondaire" onClick={() => void retirer(a)}>
                    Retirer
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
        {souhaitsVisibles.map((s) => (
          <article key={`wishlist-${s.auteur}-${s.carte.code}`} className={`annonce annonce-wishlist ${classeRarete(s.carte)}`}>
            <button type="button" className="annonce-image" onClick={() => surCarte(s.carte, false)} title={`Voir ${s.carte.nom}`}>
              <span className="cadre-carte">
                <ImageCarte image={s.carte.image} largeur={300} alt={s.carte.nom} className={s.carte.orientation === "paysage" ? "image-paysage" : undefined} paresseuse />
              </span>
            </button>
            <div className="annonce-infos">
              <span className="etiquettes-annonce">
                <span className="etiquette-annonce etiquette-cherche">{LIBELLES_ANNONCE.cherche.titre}</span>
                <span className="etiquette-annonce etiquette-wishlist">♥ Wishlist</span>
              </span>
              <h3>{s.carte.nom}</h3>
              <p className="aide">
                {s.estMoi ? "Ta wishlist" : <>wishlist de <strong><LienJoueur pseudo={s.auteur} /></strong></>}
              </p>
              {!s.estMoi && s.jePossede > 0 && <p className="pastille-info">Tu l'as ×{s.jePossede}</p>}
              <div className="annonce-actions">
                {s.estMoi ? (
                  <button className="petit secondaire" onClick={() => void retirerSouhait(s)}>
                    Retirer de ma wishlist
                  </button>
                ) : (
                  <>
                    <button className="petit" onClick={() => naviguer(lienEchangeDepuisAnnonce({ type: "cherche", auteur: s.auteur, foil: false, carte: s.carte }))}>
                      Proposer un échange
                    </button>
                    <button className="petit secondaire" onClick={() => surEcrire(s.auteur)}>
                      Écrire
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {formulaire && (
        <FormulaireAnnonce
          surFermeture={() => setFormulaire(false)}
          surCreation={() => {
            setFormulaire(false);
            setFiltre("tout");
            void charger();
          }}
        />
      )}
    </>
  );
}

// ---------- Messages privés ----------

function OngletPrive({ avec, surCarte }: { avec: string | null; surCarte: (c: Carte, foil: boolean) => void }) {
  const [conversations, setConversations] = useState<ConversationVue[] | null>(null);
  const [joueurs, setJoueurs] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  // La liste se relit à chaque changement de conversation (non lus remis à zéro), et toutes les 15 s.
  useEffect(() => {
    const charger = () =>
      appelerApi<{ conversations: ConversationVue[] }>("GET", "/marche/conversations").then(
        (r) => setConversations(r.conversations),
        (e: Error) => setErreur(e.message),
      );
    void charger();
    const t = window.setInterval(() => document.visibilityState === "visible" && void charger(), 15_000);
    return () => window.clearInterval(t);
  }, [avec]);

  useEffect(() => {
    appelerApi<{ joueurs: string[] }>("GET", "/echanges/joueurs").then((r) => setJoueurs(r.joueurs), () => undefined);
  }, []);

  const ouvrir = (pseudo: string) => naviguer(`/marche/prive/${encodeURIComponent(pseudo)}`);

  return (
    <div className={`prive ${avec ? "prive-ouverte" : ""}`}>
      <aside className="carte prive-liste">
        <label>
          Nouvelle conversation
          <select value="" onChange={(e) => e.target.value && ouvrir(e.target.value)}>
            <option value="">— Choisir un joueur —</option>
            {joueurs.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        {erreur && <p className="message-erreur">{erreur}</p>}
        {conversations?.length === 0 && <p className="aide">Aucune conversation pour l'instant.</p>}
        <ul className="liste-conversations">
          {conversations?.map((c) => (
            <li key={c.avec}>
              <button className={`conversation ${c.avec === avec ? "actif" : ""}`} onClick={() => ouvrir(c.avec)}>
                <AvatarJoueur pseudo={c.avec} avatar={c.avecAvatar} taille="petit" />
                <span className="conversation-texte">
                  <strong>{c.avec}</strong>
                  <span>
                    {c.deMoi ? "Toi : " : ""}
                    {c.dernierMessage}
                  </span>
                </span>
                <span className="conversation-meta">
                  <time>{heureMessage(c.creeLe)}</time>
                  {c.nonLus > 0 && c.avec !== avec && <span className="pastille">{c.nonLus}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="carte carte-fil prive-fil">
        {avec ? (
          <>
            <header className="prive-entete">
              <button className="petit secondaire prive-retour" onClick={() => naviguer("/marche/prive")}>
                ← Conversations
              </button>
              <h2>
                <LienJoueur pseudo={avec} />
              </h2>
              <button className="petit secondaire" onClick={() => naviguer(`/echanges/nouveau?avec=${encodeURIComponent(avec)}`)}>
                Proposer un échange
              </button>
            </header>
            <FilDiscussion
              key={avec}
              source={`/marche/prive/${encodeURIComponent(avec)}`}
              placeholder={`Écris à ${avec}…`}
              vide={`Aucun message avec ${avec} pour l'instant.`}
              surCarte={surCarte}
            />
          </>
        ) : (
          <p className="aide fil-vide">Choisis une conversation ou un joueur à gauche.</p>
        )}
      </section>
    </div>
  );
}
