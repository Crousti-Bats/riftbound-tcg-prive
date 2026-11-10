/**
 * Discussion dans une bulle en bas à droite de l'écran (demandé le 2026-11-10, à la place des onglets du marché).
 * Fermée : un rond avec le nombre de messages non lus (salon + privés). Ouverte : un panneau avec deux onglets,
 * Salon et Messages privés (liste des conversations, puis la conversation). Sur téléphone, le panneau prend l'écran.
 */
import { useCallback, useEffect, useState } from "react";
import { AvatarJoueur, LienJoueur } from "./avatar-joueur";
import { FicheCarte } from "./fiche-carte";
import { FilDiscussion } from "./fil-discussion";
import { appelerApi } from "../outils/appels-api";
import { changerVueChat, ecrireA, fermerChat, ouvrirChat, useChat } from "../outils/chat";
import type { Carte, SetInfo } from "../outils/libelles-cartes";
import { type ConversationVue, heureMessage } from "../outils/marche";
import { naviguer } from "../outils/navigation";

const trait = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function ChatFlottant({ chemin }: { chemin: string }) {
  const chat = useChat();
  const [nonLus, setNonLus] = useState({ salon: 0, prive: 0 });
  const [fiche, setFiche] = useState<{ carte: Carte; foil: boolean } | null>(null);
  const [sets, setSets] = useState<SetInfo[]>([]);

  // Non lus : relus toutes les 30 s (10 s quand la bulle est ouverte, pour suivre la lecture), en pause onglet caché.
  const lireNonLus = useCallback(
    () => appelerApi<{ salon: number; prive: number }>("GET", "/marche/non-lus").then(setNonLus, () => undefined),
    [],
  );
  useEffect(() => {
    void lireNonLus();
    const t = window.setInterval(() => document.visibilityState === "visible" && void lireNonLus(), chat.ouvert ? 10_000 : 30_000);
    return () => window.clearInterval(t);
  }, [lireNonLus, chat.ouvert, chat.vue, chat.avec, chemin]);

  useEffect(() => {
    if (!chat.ouvert || sets.length) return;
    appelerApi<{ sets: SetInfo[] }>("GET", "/catalogue/sets").then((r) => setSets(r.sets), () => undefined);
  }, [chat.ouvert, sets.length]);

  // Échap ferme la bulle (sauf si une fiche de carte est ouverte par-dessus : elle se ferme d'abord).
  useEffect(() => {
    if (!chat.ouvert) return;
    const echap = (e: KeyboardEvent) => e.key === "Escape" && !fiche && fermerChat();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [chat.ouvert, fiche]);

  const total = nonLus.salon + nonLus.prive;
  const ouvrirFiche = useCallback((carte: Carte, foil: boolean) => setFiche({ carte, foil }), []);
  const nomSet = (code: string) => sets.find((s) => s.code === code)?.nom ?? code.toUpperCase();
  const pastille = (n: number) => (n > 0 ? <span className="pastille">{n > 99 ? "99+" : n}</span> : null);

  return (
    <>
      {chat.ouvert && (
        <section className="chat-panneau" role="dialog" aria-label="Discussion">
          <header className="chat-entete">
            <div className="onglets onglets-pleins" role="tablist">
              <button role="tab" aria-selected={chat.vue === "salon"} className={chat.vue === "salon" ? "onglet actif" : "onglet"} onClick={() => changerVueChat("salon")}>
                Salon {chat.vue !== "salon" && pastille(nonLus.salon)}
              </button>
              <button role="tab" aria-selected={chat.vue === "prive"} className={chat.vue === "prive" ? "onglet actif" : "onglet"} onClick={() => changerVueChat("prive", chat.avec)}>
                Messages privés {pastille(nonLus.prive)}
              </button>
            </div>
            <button className="bouton-icone" onClick={fermerChat} aria-label="Fermer la discussion" title="Fermer">
              <svg viewBox="0 0 24 24" aria-hidden="true" {...trait}>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </header>
          <div className="chat-corps">
            {chat.vue === "salon" ? (
              <FilDiscussion
                key="salon"
                source="/marche/salon"
                placeholder="Écris à tout le monde…"
                vide="Personne n'a encore écrit. Lance la discussion !"
                surCarte={ouvrirFiche}
                surMessagePrive={ecrireA}
              />
            ) : chat.avec ? (
              <>
                <div className="prive-entete">
                  <button className="petit secondaire" onClick={() => changerVueChat("prive", null)} aria-label="Retour aux conversations">
                    ←
                  </button>
                  <h2>
                    <LienJoueur pseudo={chat.avec} />
                  </h2>
                  <button className="petit secondaire" onClick={() => chat.avec && naviguer(`/echanges/nouveau?avec=${encodeURIComponent(chat.avec)}`)}>
                    Proposer un échange
                  </button>
                </div>
                <FilDiscussion
                  key={chat.avec}
                  source={`/marche/prive/${encodeURIComponent(chat.avec)}`}
                  placeholder={`Écris à ${chat.avec}…`}
                  vide={`Aucun message avec ${chat.avec} pour l'instant.`}
                  surCarte={ouvrirFiche}
                />
              </>
            ) : (
              <ListeConversations />
            )}
          </div>
        </section>
      )}

      <button
        className={`chat-bulle ${chat.ouvert ? "chat-bulle-ouverte" : ""}`}
        onClick={() => (chat.ouvert ? fermerChat() : ouvrirChat(total > 0 && nonLus.prive > 0 && nonLus.salon === 0 ? { vue: "prive" } : undefined))}
        aria-label={chat.ouvert ? "Fermer la discussion" : total > 0 ? `Discussion : ${total} message(s) non lu(s)` : "Ouvrir la discussion"}
        aria-expanded={chat.ouvert}
      >
        {chat.ouvert ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" {...trait}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" {...trait}>
            <path d="M4 5h16v11H9l-5 4z" />
            <path d="M8 9.5h8M8 12.5h5" />
          </svg>
        )}
        {!chat.ouvert && total > 0 && <span className="pastille chat-pastille">{total > 99 ? "99+" : total}</span>}
      </button>

      {fiche && <FicheCarte carte={fiche.carte} nomSet={nomSet(fiche.carte.set)} foil={fiche.foil} surFermeture={() => setFiche(null)} />}
    </>
  );
}

/** Messages privés : nouvelle conversation et liste des conversations (relue toutes les 15 s). */
function ListeConversations() {
  const [conversations, setConversations] = useState<ConversationVue[] | null>(null);
  const [joueurs, setJoueurs] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const charger = () =>
      appelerApi<{ conversations: ConversationVue[] }>("GET", "/marche/conversations").then(
        (r) => setConversations(r.conversations),
        (e: Error) => setErreur(e.message),
      );
    void charger();
    const t = window.setInterval(() => document.visibilityState === "visible" && void charger(), 15_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    appelerApi<{ joueurs: string[] }>("GET", "/echanges/joueurs").then((r) => setJoueurs(r.joueurs), () => undefined);
  }, []);

  return (
    <div className="chat-liste">
      <label>
        Nouvelle conversation
        <select value="" onChange={(e) => e.target.value && ecrireA(e.target.value)}>
          <option value="">— Choisir un joueur —</option>
          {joueurs.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      {erreur && <p className="message-erreur">{erreur}</p>}
      {!conversations && !erreur && <p className="aide">Chargement…</p>}
      {conversations?.length === 0 && <p className="aide">Aucune conversation pour l'instant.</p>}
      <ul className="liste-conversations">
        {conversations?.map((c) => (
          <li key={c.avec}>
            <button className="conversation" onClick={() => ecrireA(c.avec)}>
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
                {c.nonLus > 0 && <span className="pastille">{c.nonLus}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
