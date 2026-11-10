/** Mes decks : liste et création. Un deck se construit avec les cartes de sa collection, puis se copie dans TCG Arena. */
import { type FormEvent, useEffect, useState } from "react";
import { ImageCarte } from "../composants/image-carte";
import { appelerApi } from "../outils/appels-api";
import type { Carte } from "../outils/libelles-cartes";
import { NOMBRE_RUNES, NOMBRE_TERRAINS, TAILLE_PRINCIPAL } from "../outils/decks";
import { formaterDate, naviguer } from "../outils/navigation";

interface ResumeDeck {
  id: number;
  nom: string;
  modifieLe: number;
  legende: Carte | null;
  valide: boolean;
  compteurs: { principal: number; runes: number; terrains: number };
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
        <h1>Mes decks</h1>
      </header>

      <section className="carte pile-serree">
        <p className="aide">
          Construis un deck avec les cartes de ta collection, puis copie-le dans <strong>TCG Arena</strong> pour jouer en ligne avec
          tes amis.
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
          <button type="submit" disabled={enCours || (decks !== null && decks.length >= max)}>
            Créer un deck
          </button>
        </form>
        {decks !== null && decks.length >= max && <p className="aide">Tu as atteint {max} decks : supprimes-en un pour en créer un autre.</p>}
      </section>

      {erreur && <p className="message-erreur">{erreur}</p>}
      {!decks && !erreur && <p className="aide">Chargement…</p>}
      {decks && decks.length === 0 && <p className="aide">Aucun deck pour l'instant.</p>}

      <section className="liste-decks">
        {decks?.map((d) => (
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
