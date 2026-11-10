/**
 * Fil de discussion (salon commun ou conversation privée) : messages, saisie, suppression.
 * Rafraîchi toutes les 4 secondes tant que la page est visible (seulement les nouveaux messages : `?apres=<id>`).
 * Les messages publiés avec une annonce affichent la carte à côté.
 * Le texte est affiché comme du texte (React l'échappe) : aucun HTML n'est interprété.
 */
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AvatarJoueur, LienJoueur } from "./avatar-joueur";
import { ImageCarte } from "./image-carte";
import { appelerApi } from "../outils/appels-api";
import { type Carte, classeRarete } from "../outils/libelles-cartes";
import { heureMessage, LIBELLES_ANNONCE, lienEchangeDepuisAnnonce, type MessageVue } from "../outils/marche";
import { naviguer } from "../outils/navigation";

const INTERVALLE_MS = 4000;

interface Props {
  /** "/marche/salon" ou "/marche/prive/<pseudo>". */
  source: string;
  placeholder: string;
  vide: string;
  surCarte: (carte: Carte, foil: boolean) => void;
  /** Ouvre une conversation privée avec l'auteur d'un message (salon uniquement). */
  surMessagePrive?: (pseudo: string) => void;
}

export function FilDiscussion({ source, placeholder, vide, surCarte, surMessagePrive }: Props) {
  const [messages, setMessages] = useState<MessageVue[] | null>(null);
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const liste = useRef<HTMLDivElement>(null);
  const dernierId = useRef<number | undefined>(undefined);
  const enCours = useRef(false);
  const collerEnBas = useRef(true);

  const ajouter = useCallback((nouveaux: MessageVue[], remplacer = false) => {
    if (remplacer) setMessages(nouveaux);
    else if (nouveaux.length) setMessages((prev) => [...(prev ?? []), ...nouveaux.filter((n) => !prev?.some((m) => m.id === n.id))]);
    const dernier = nouveaux.at(-1)?.id;
    if (dernier !== undefined) dernierId.current = Math.max(dernier, dernierId.current ?? 0);
  }, []);

  const rafraichir = useCallback(async () => {
    if (enCours.current) return;
    enCours.current = true;
    try {
      const apres = dernierId.current;
      const r = await appelerApi<{ messages: MessageVue[] }>("GET", apres === undefined ? source : `${source}?apres=${apres}`);
      ajouter(r.messages, apres === undefined);
      setErreur(null);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      enCours.current = false;
    }
  }, [source, ajouter]);

  // Chargement initial puis rafraîchissement périodique (en pause quand l'onglet est caché).
  useEffect(() => {
    dernierId.current = undefined;
    collerEnBas.current = true;
    void rafraichir();
    const minuteur = window.setInterval(() => {
      if (document.visibilityState === "visible") void rafraichir();
    }, INTERVALLE_MS);
    const auRetour = () => document.visibilityState === "visible" && void rafraichir();
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      window.clearInterval(minuteur);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, [rafraichir]);

  // Reste collé en bas quand de nouveaux messages arrivent, sauf si on est remonté lire l'historique.
  useEffect(() => {
    const el = liste.current;
    if (el && collerEnBas.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function surDefilement() {
    const el = liste.current;
    if (el) collerEnBas.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    const contenu = texte.trim();
    if (!contenu) return;
    setEnvoi(true);
    try {
      await appelerApi("POST", source, { texte: contenu });
      setTexte("");
      collerEnBas.current = true;
      await rafraichir();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimer(m: MessageVue) {
    if (!window.confirm("Supprimer ce message ?")) return;
    try {
      await appelerApi("DELETE", `/marche/messages/${m.id}`);
      setMessages((prev) => prev?.filter((x) => x.id !== m.id) ?? null);
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  return (
    <div className="fil">
      <div className="fil-messages" ref={liste} onScroll={surDefilement} aria-live="polite">
        {!messages && !erreur && <p className="aide fil-vide">Chargement…</p>}
        {messages && messages.length === 0 && <p className="aide fil-vide">{vide}</p>}
        {messages?.map((m, i) => {
          const suite = i > 0 && messages[i - 1]?.auteur === m.auteur && m.creeLe - (messages[i - 1]?.creeLe ?? 0) < 5 * 60_000;
          const a = m.annonce;
          return (
            <article key={m.id} className={`message ${m.estMoi ? "message-moi" : ""} ${suite ? "message-suite" : ""}`}>
              {!suite && (
                <header className="message-entete">
                  <LienJoueur pseudo={m.auteur}>
                    <AvatarJoueur pseudo={m.auteur} avatar={m.auteurAvatar} taille="petit" />
                  </LienJoueur>
                  <strong>{m.estMoi ? "Moi" : <LienJoueur pseudo={m.auteur} />}</strong>
                  <time dateTime={new Date(m.creeLe).toISOString()}>{heureMessage(m.creeLe)}</time>
                </header>
              )}
              <div className="message-corps">
                {a?.carte && (
                  <div className={`message-annonce ${a.active ? "" : "annonce-inactive"}`}>
                    <button
                      type="button"
                      className={`miniature-annonce ${classeRarete(a.carte)}`}
                      onClick={() => a.carte && surCarte(a.carte, a.foil)}
                      title={`Voir ${a.carte.nom}`}
                    >
                      <ImageCarte
                        image={a.carte.image}
                        largeur={300}
                        alt={a.carte.nom}
                        className={a.carte.orientation === "paysage" ? "miniature miniature-paysage" : "miniature"}
                      />
                    </button>
                    <div className="message-annonce-infos">
                      <span className={`etiquette-annonce etiquette-${a.type}`}>{LIBELLES_ANNONCE[a.type].titre}</span>
                      <strong>
                        {a.carte.nom}
                        {a.foil && " · Foil"}
                      </strong>
                      {!a.active && <span className="aide">Annonce terminée</span>}
                      {a.active && !m.estMoi && (
                        <span className="message-annonce-actions">
                          <button
                            type="button"
                            className="petit"
                            onClick={() => a.carte && naviguer(lienEchangeDepuisAnnonce({ type: a.type, auteur: m.auteur, foil: a.foil, carte: a.carte }))}
                          >
                            Proposer un échange
                          </button>
                          {surMessagePrive && (
                            <button type="button" className="petit secondaire" onClick={() => surMessagePrive(m.auteur)}>
                              Écrire à {m.auteur}
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {m.texte && <p className="message-texte">{m.texte}</p>}
                {m.peutSupprimer && (
                  <button type="button" className="message-supprimer" onClick={() => void supprimer(m)} aria-label="Supprimer ce message" title="Supprimer">
                    ×
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {erreur && <p className="message-erreur fil-erreur">{erreur}</p>}
      <form className="fil-saisie" onSubmit={envoyer}>
        <input
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder={placeholder}
          maxLength={500}
          aria-label="Message"
          enterKeyHint="send"
        />
        <button type="submit" disabled={envoi || !texte.trim()}>
          Envoyer
        </button>
      </form>
    </div>
  );
}
