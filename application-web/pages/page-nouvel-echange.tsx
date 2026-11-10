/**
 * Nouvelle proposition d'échange :
 * 1. choisir le joueur ; 2. piocher « je donne » dans ma collection et « je demande » dans la sienne ;
 * 3. message optionnel, puis envoi. Un des deux côtés peut rester vide (don), pas les deux.
 * Le serveur revérifie tout (possession, limites) : cette page ne fait que préparer la demande.
 */
import { useEffect, useMemo, useState } from "react";
import { type ElementListe, ListeCartesEchange } from "../composants/liste-cartes-echange";
import { SelecteurCartes } from "../composants/selecteur-cartes";
import { appelerApi } from "../outils/appels-api";
import { cleLigne, type LignePanier } from "../outils/echanges";
import type { CartePossedee, SetInfo } from "../outils/libelles-cartes";
import { naviguer } from "../outils/navigation";

type Cote = "donne" | "demande";

function versElements(panier: Map<string, LignePanier>): ElementListe[] {
  return [...panier.entries()].map(([cle, l]) => ({ cle, carte: l.carte, code: l.carte.code, foil: l.foil, quantite: l.quantite }));
}

export function PageNouvelEchange() {
  const [joueurs, setJoueurs] = useState<string[] | null>(null);
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [joueur, setJoueur] = useState(() => new URLSearchParams(window.location.search).get("avec") ?? "");
  const [vue, setVue] = useState<Cote>("demande");
  const [donne, setDonne] = useState<Map<string, LignePanier>>(new Map());
  const [demande, setDemande] = useState<Map<string, LignePanier>>(new Map());
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Pré-remplissage depuis une annonce du marché : ?avec=Bob&donne=ogn-001:0 ou &demande=ogn-001:1.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const avec = params.get("avec");
    const prefill: Array<[Cote, string | null, string]> = [
      ["donne", params.get("donne"), "/collection"],
      ["demande", params.get("demande"), avec ? `/collection/joueur/${encodeURIComponent(avec)}` : ""],
    ];
    for (const [cote, valeur, source] of prefill) {
      const [code, foilTexte] = (valeur ?? "").split(":");
      if (!code || !source || !/^[a-z0-9-]{3,40}$/.test(code)) continue;
      const foil = foilTexte === "1";
      appelerApi<{ cartes: CartePossedee[] }>("GET", `${source}?code=${encodeURIComponent(code)}`).then(
        (r) => {
          const carte = r.cartes[0];
          const max = carte ? (foil ? carte.quantiteFoil : carte.quantite) : 0;
          if (!carte || max < 1) {
            setErreur(cote === "donne" ? "Tu n'as pas (ou plus) cette carte." : `${avec} n'a plus cette carte.`);
            return;
          }
          const ligne: LignePanier = { carte, foil, quantite: 1, max };
          const maj = (p: Map<string, LignePanier>) => new Map(p).set(cleLigne(carte.code, foil), ligne);
          if (cote === "donne") setDonne(maj);
          else setDemande(maj);
        },
        () => undefined,
      );
    }
  }, []);

  useEffect(() => {
    appelerApi<{ joueurs: string[] }>("GET", "/echanges/joueurs").then((r) => setJoueurs(r.joueurs), (e: Error) => setErreur(e.message));
    appelerApi<{ sets: SetInfo[] }>("GET", "/catalogue/sets").then((r) => setSets(r.sets), () => undefined);
  }, []);

  function changerJoueur(pseudo: string) {
    setJoueur(pseudo);
    setDemande(new Map()); // ce qu'on demandait à l'ancien joueur n'a plus de sens
  }

  const panier = (cote: Cote) => (cote === "donne" ? donne : demande);
  const majPanier = (cote: Cote, nouveau: Map<string, LignePanier>) => (cote === "donne" ? setDonne(nouveau) : setDemande(nouveau));

  function ajouter(cote: Cote, carte: CartePossedee, foil: boolean) {
    const copie = new Map(panier(cote));
    const cle = cleLigne(carte.code, foil);
    const max = foil ? carte.quantiteFoil : carte.quantite;
    const actuelle = copie.get(cle);
    if (actuelle) copie.set(cle, { ...actuelle, quantite: Math.min(max, actuelle.quantite + 1) });
    else copie.set(cle, { carte, foil, quantite: 1, max });
    majPanier(cote, copie);
  }

  function modifier(cote: Cote, cle: string, delta: number) {
    const copie = new Map(panier(cote));
    const ligne = copie.get(cle);
    if (!ligne) return;
    const quantite = Math.min(ligne.max, ligne.quantite + delta);
    if (quantite <= 0) copie.delete(cle);
    else copie.set(cle, { ...ligne, quantite });
    majPanier(cote, copie);
  }

  const maxParCle = (cote: Cote) => new Map([...panier(cote).entries()].map(([cle, l]) => [cle, l.max]));
  const dejaChoisiDonne = useMemo(() => new Map([...donne.entries()].map(([cle, l]) => [cle, l.quantite])), [donne]);
  const dejaChoisiDemande = useMemo(() => new Map([...demande.entries()].map(([cle, l]) => [cle, l.quantite])), [demande]);

  async function envoyer() {
    setErreur(null);
    if (!joueur) return setErreur("Choisis d'abord un joueur.");
    if (donne.size + demande.size === 0) return setErreur("Ajoute au moins une carte (à donner ou à demander).");
    setEnvoi(true);
    const lignes = (p: Map<string, LignePanier>) => [...p.values()].map((l) => ({ code: l.carte.code, foil: l.foil, quantite: l.quantite }));
    try {
      await appelerApi("POST", "/echanges", {
        destinataire: joueur,
        donne: lignes(donne),
        demande: lignes(demande),
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      naviguer("/echanges");
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <main className="conteneur">
      <header className="entete">
        <h1>Nouvel échange</h1>
        <nav className="barre-actions">
          <button className="secondaire" onClick={() => naviguer("/echanges")}>
            Retour
          </button>
        </nav>
      </header>

      <section className="carte formulaire">
        <label>
          Avec qui ?
          <select value={joueur} onChange={(e) => changerJoueur(e.target.value)}>
            <option value="">— Choisir un joueur —</option>
            {(joueurs ?? []).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        {joueurs && joueurs.length === 0 && <p className="aide">Aucun autre joueur pour l'instant : invite des amis !</p>}
      </section>

      {joueur && (
        <>
          <section className="carte recapitulatif-echange">
            <div className="colonnes-echange">
              <div>
                <h3>Je donne</h3>
                <ListeCartesEchange
                  elements={versElements(donne)}
                  vide="Rien pour l'instant (possible : tu demandes un don)"
                  surChangement={(cle, d) => modifier("donne", cle, d)}
                  maxParCle={maxParCle("donne")}
                />
              </div>
              <div>
                <h3>Je demande à {joueur}</h3>
                <ListeCartesEchange
                  elements={versElements(demande)}
                  vide="Rien pour l'instant (possible : tu fais un don)"
                  surChangement={(cle, d) => modifier("demande", cle, d)}
                  maxParCle={maxParCle("demande")}
                />
              </div>
            </div>
            <label>
              Message <span className="aide">(optionnel, 200 caractères max)</span>
              <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} placeholder="ex. Ta Jinx contre mes 3 Épiques ?" />
            </label>
            {erreur && <p className="message-erreur">{erreur}</p>}
            <p className="aide">La proposition reste valable 48 heures. Les cartes ne bougent qu'au moment où {joueur} accepte.</p>
            <button onClick={envoyer} disabled={envoi || donne.size + demande.size === 0}>
              {envoi ? "Envoi…" : "Envoyer la proposition"}
            </button>
          </section>

          <nav className="onglets">
            <button className={vue === "demande" ? "onglet actif" : "onglet"} onClick={() => setVue("demande")}>
              Collection de {joueur}
            </button>
            <button className={vue === "donne" ? "onglet actif" : "onglet"} onClick={() => setVue("donne")}>
              Ma collection
            </button>
          </nav>
          <p className="aide">
            {vue === "demande"
              ? `Clique sur une carte pour la demander à ${joueur}. « Tu ne l'as pas » : une carte qui te manque.`
              : `Clique sur une carte pour la donner. « Il ne l'a pas » : une carte qui manque à ${joueur}.`}
          </p>

          {vue === "demande" ? (
            <SelecteurCartes
              key={`demande-${joueur}`}
              source={`/collection/joueur/${encodeURIComponent(joueur)}`}
              sets={sets}
              dejaChoisi={dejaChoisiDemande}
              surAjout={(carte, foil) => ajouter("demande", carte, foil)}
              comparaison={{ parametre: "comparer=1", manque: "Tu ne l'as pas", filtre: "Seulement celles que je n'ai pas" }}
            />
          ) : (
            <SelecteurCartes
              key="donne"
              source="/collection"
              sets={sets}
              dejaChoisi={dejaChoisiDonne}
              surAjout={(carte, foil) => ajouter("donne", carte, foil)}
              comparaison={{ parametre: `comparer=${joueur}`, manque: "Il ne l'a pas", filtre: `Seulement celles que ${joueur} n'a pas` }}
            />
          )}
        </>
      )}
    </main>
  );
}
