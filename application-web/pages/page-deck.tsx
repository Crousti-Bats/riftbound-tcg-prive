/**
 * Éditeur de deck : à gauche le deck (Légende, champion, deck principal, runes, champs de bataille, règles),
 * à droite ma collection. Un clic sur une carte de la collection la place dans la bonne zone.
 * Sauvegarde automatique ; le serveur renvoie la validation et le texte à coller dans TCG Arena.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiltresCartes } from "../composants/filtres-cartes";
import { ImageCarte } from "../composants/image-carte";
import { Pagination } from "../composants/pagination";
import { appelerApi } from "../outils/appels-api";
import {
  type AnalyseDeck,
  type ContenuDeck,
  type LigneDeck,
  type ValidationDeck,
  NOMBRE_RUNES,
  NOMBRE_TERRAINS,
  TAILLE_PRINCIPAL,
  ajouterCarte,
  compterPrincipal,
  compterRunes,
  domainesDe,
  exemplairesUtilises,
  grouperParType,
  retirerCarte,
} from "../outils/decks";
import { type Carte, type CartePossedee, LIBELLES_TYPE, classeRarete, libelleRarete, type SetInfo } from "../outils/libelles-cartes";
import { naviguer } from "../outils/navigation";

interface ReponseCollection {
  cartes: CartePossedee[];
  total: number;
  page: number;
  parPage: number;
}

const LIBELLES_GROUPE: Record<string, string> = { Unit: "Unités", Spell: "Sorts", Gear: "Équipements" };
type Statut = "enregistre" | "modifie" | "enregistrement" | "erreur";

export function PageDeck({ id }: { id: number }) {
  const [nom, setNom] = useState("");
  const [deck, setDeck] = useState<ContenuDeck | null>(null);
  const [cartes, setCartes] = useState<Record<string, Carte>>({});
  const [possession, setPossession] = useState<Record<string, number>>({});
  const [validation, setValidation] = useState<ValidationDeck | null>(null);
  const [texteExport, setTexteExport] = useState("");
  const [statut, setStatut] = useState<Statut>("enregistre");
  const [erreur, setErreur] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [onglet, setOnglet] = useState<"deck" | "collection">("deck");
  const version = useRef(0);

  const appliquer = useCallback((a: AnalyseDeck) => {
    setCartes((prev) => ({ ...prev, ...a.cartes }));
    setPossession((prev) => ({ ...prev, ...a.possession }));
    setValidation(a.validation);
    setTexteExport(a.export);
  }, []);

  useEffect(() => {
    appelerApi<AnalyseDeck>("GET", `/decks/${id}`).then(
      (a) => {
        setNom(a.nom);
        setDeck(a.contenu);
        appliquer(a);
      },
      (e: Error) => setErreur(e.message),
    );
  }, [id, appliquer]);

  // Sauvegarde automatique, 800 ms après la dernière modification. Une réponse plus ancienne que la dernière
  // modification est ignorée (on ne remplace jamais ce que le joueur vient de faire).
  useEffect(() => {
    if (!deck || statut !== "modifie") return;
    const numero = version.current;
    const minuteur = setTimeout(() => {
      setStatut("enregistrement");
      appelerApi<AnalyseDeck>("POST", `/decks/${id}`, { nom: nom.trim() || "Deck sans nom", contenu: deck }).then(
        (a) => {
          if (numero !== version.current) return;
          appliquer(a);
          setStatut("enregistre");
        },
        (e: Error) => {
          if (numero !== version.current) return;
          setErreur(e.message);
          setStatut("erreur");
        },
      );
    }, 800);
    return () => clearTimeout(minuteur);
  }, [deck, nom, statut, id, appliquer]);

  const modifier = (suivant: ContenuDeck) => {
    version.current++;
    setDeck(suivant);
    setStatut("modifie");
    setErreur(null);
  };

  function ajouterDepuisCollection(carte: CartePossedee) {
    if (!deck) return;
    const possedees = carte.quantite + carte.quantiteFoil;
    const toutes = { ...cartes, [carte.code]: carte };
    setCartes(toutes);
    setPossession((prev) => ({ ...prev, [carte.code]: possedees }));
    const r = ajouterCarte(deck, carte, possedees, toutes);
    if (!r.ok) {
      setAvis(r.raison);
      return;
    }
    setAvis(null);
    modifier(r.deck);
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(texteExport);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      setAvis("Copie impossible : sélectionne la liste ci-dessous et copie-la à la main.");
    }
  }

  function supprimer() {
    if (!window.confirm(`Supprimer le deck « ${nom} » ? C'est définitif.`)) return;
    appelerApi("DELETE", `/decks/${id}`).then(
      () => naviguer("/jouer"),
      (e: Error) => setErreur(e.message),
    );
  }

  if (erreur && !deck) {
    return (
      <main className="conteneur">
        <p className="message-erreur">{erreur}</p>
        <button className="secondaire" onClick={() => naviguer("/jouer")}>
          Retour à « Jouer »
        </button>
      </main>
    );
  }
  if (!deck) return <main className="conteneur"><p className="aide">Chargement…</p></main>;

  const legende = deck.legende ? cartes[deck.legende] : undefined;
  const principal = compterPrincipal(deck);
  const libelleStatut = { enregistre: "Enregistré", modifie: "Modifications…", enregistrement: "Enregistrement…", erreur: "Non enregistré" }[statut];

  return (
    <main className="conteneur">
      <header className="entete">
        <button className="secondaire petit" onClick={() => naviguer("/jouer")}>
          ← Jouer
        </button>
        <span className={statut === "erreur" ? "statut-deck statut-deck-erreur" : "statut-deck"} role="status">
          {libelleStatut}
        </span>
      </header>

      <div className="onglets onglets-pleins onglets-deck" role="tablist">
        <button role="tab" aria-selected={onglet === "deck"} className={onglet === "deck" ? "onglet actif" : "onglet"} onClick={() => setOnglet("deck")}>
          Mon deck ({principal}/{TAILLE_PRINCIPAL})
        </button>
        <button
          role="tab"
          aria-selected={onglet === "collection"}
          className={onglet === "collection" ? "onglet actif" : "onglet"}
          onClick={() => setOnglet("collection")}
        >
          Ajouter des cartes
        </button>
      </div>

      {avis && (
        <p className="avis-deck" role="status">
          {avis}
        </p>
      )}
      {erreur && <p className="message-erreur">{erreur}</p>}

      <div className="editeur-deck" data-onglet={onglet}>
        <section className="carte panneau-deck">
          <input
            className="nom-deck"
            type="text"
            value={nom}
            maxLength={40}
            aria-label="Nom du deck"
            onChange={(e) => {
              setNom(e.target.value);
              version.current++;
              setStatut("modifie");
            }}
          />

          <div className="compteurs-deck">
            <Compteur libelle="Deck principal" valeur={principal} cible={TAILLE_PRINCIPAL} auMoins />
            <Compteur libelle="Runes" valeur={compterRunes(deck)} cible={NOMBRE_RUNES} />
            <Compteur libelle="Champs de bataille" valeur={deck.terrains.length} cible={NOMBRE_TERRAINS} />
          </div>

          <div className="emplacements-deck">
            <Emplacement titre="Légende" carte={legende} vide="Clique sur une Légende de ta collection" surRetirer={() => modifier(retirerCarte(deck, "legende", deck.legende ?? ""))} />
            <Emplacement
              titre="Champion"
              carte={deck.champion ? cartes[deck.champion] : undefined}
              vide={legende ? `Clique sur un champion ${(legende.tags ?? []).join(" / ")}` : "Choisis d'abord ta Légende"}
              surRetirer={() => modifier(retirerCarte(deck, "champion", deck.champion ?? ""))}
            />
          </div>
          {legende && <p className="aide">Domaines : {domainesDe(legende).join(" + ") || "aucun"}</p>}

          {grouperParType(deck.principal, cartes).map((g) => (
            <ZoneDeck key={g.type} titre={`${LIBELLES_GROUPE[g.type] ?? LIBELLES_TYPE[g.type] ?? g.type} (${g.total})`}>
              {g.lignes.map((l) => (
                <LigneCarte key={l.code} ligne={l} carte={cartes[l.code]} manque={exemplairesUtilises(deck, l.code) > (possession[l.code] ?? 0)} surRetirer={() => modifier(retirerCarte(deck, "principal", l.code))} />
              ))}
            </ZoneDeck>
          ))}
          {deck.principal.length === 0 && <p className="aide">Deck principal vide : ajoute des unités, sorts et équipements.</p>}

          <ZoneDeck titre={`Runes (${compterRunes(deck)}/${NOMBRE_RUNES})`}>
            {deck.runes.map((l) => (
              <LigneCarte key={l.code} ligne={l} carte={cartes[l.code]} manque={exemplairesUtilises(deck, l.code) > (possession[l.code] ?? 0)} surRetirer={() => modifier(retirerCarte(deck, "runes", l.code))} />
            ))}
          </ZoneDeck>
          <ZoneDeck titre={`Champs de bataille (${deck.terrains.length}/${NOMBRE_TERRAINS})`}>
            {deck.terrains.map((code) => (
              <LigneCarte key={code} ligne={{ code, n: 1 }} carte={cartes[code]} manque={(possession[code] ?? 0) < 1} surRetirer={() => modifier(retirerCarte(deck, "terrains", code))} />
            ))}
          </ZoneDeck>

          {validation && <BlocValidation validation={validation} modifie={statut !== "enregistre"} />}

          <div className="export-deck">
            <h2>Jouer sur TCG Arena</h2>
            <ol className="aide">
              <li>Copie la liste de ton deck.</li>
              <li>Dans TCG Arena, choisis le jeu Riftbound, puis Decks → Import.</li>
              <li>Colle la liste et valide.</li>
            </ol>
            <button onClick={() => void copier()} disabled={!texteExport || statut !== "enregistre"}>
              {copie ? "Copié !" : "Copier la liste"}
            </button>
            {texteExport && (
              <details>
                <summary>Voir la liste</summary>
                <pre className="liste-export">{texteExport}</pre>
              </details>
            )}
            <p className="aide">Le même texte s'importe aussi sur Rift Atlas, riftbound.gg et Piltover Archive.</p>
          </div>

          <button className="danger petit" onClick={supprimer}>
            Supprimer ce deck
          </button>
        </section>

        <SelecteurCollection deck={deck} legende={legende} surChoix={ajouterDepuisCollection} />
      </div>
    </main>
  );
}

function Compteur({ libelle, valeur, cible, auMoins }: { libelle: string; valeur: number; cible: number; auMoins?: boolean }) {
  const ok = auMoins ? valeur >= cible : valeur === cible;
  return (
    <p className={ok ? "compteur-deck compteur-deck-ok" : "compteur-deck"}>
      <strong>
        {valeur}/{cible}
      </strong>
      <span>{libelle}</span>
    </p>
  );
}

function Emplacement({ titre, carte, vide, surRetirer }: { titre: string; carte: Carte | undefined; vide: string; surRetirer: () => void }) {
  return (
    <div className="emplacement-deck">
      <span className="surtitre">{titre}</span>
      {carte ? (
        <>
          <ImageCarte image={carte.image} largeur={300} alt={carte.nom} className="emplacement-image" />
          <span className="emplacement-nom">{carte.sousTitre ? `${carte.nom}, ${carte.sousTitre}` : carte.nom}</span>
          <button className="secondaire petit" onClick={surRetirer}>
            Retirer
          </button>
        </>
      ) : (
        <span className="emplacement-vide aide">{vide}</span>
      )}
    </div>
  );
}

function ZoneDeck({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="zone-deck">
      <h3>{titre}</h3>
      <ul className="lignes-deck">{children}</ul>
    </div>
  );
}

function LigneCarte({ ligne, carte, manque, surRetirer }: { ligne: LigneDeck; carte: Carte | undefined; manque: boolean; surRetirer: () => void }) {
  const nom = carte ? (carte.sousTitre ? `${carte.nom}, ${carte.sousTitre}` : carte.nom) : ligne.code;
  return (
    <li className={manque ? "ligne-deck ligne-deck-manque" : "ligne-deck"}>
      <span className="ligne-deck-n">{ligne.n}×</span>
      {carte?.energie != null && <span className="ligne-deck-cout">{carte.energie}</span>}
      <span className="ligne-deck-nom" title={manque ? "Tu n'as pas assez d'exemplaires" : undefined}>
        {nom}
      </span>
      <button className="bouton-icone" onClick={surRetirer} aria-label={`Retirer un ${nom}`}>
        −
      </button>
    </li>
  );
}

function BlocValidation({ validation, modifie }: { validation: ValidationDeck; modifie: boolean }) {
  if (validation.valide && !modifie) return <p className="validation-deck validation-deck-ok">✓ Deck prêt à jouer</p>;
  return (
    <div className="validation-deck">
      <h3>{modifie ? "À vérifier après l'enregistrement" : "Pour que le deck soit jouable"}</h3>
      <ul>
        {validation.erreurs.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

/** Ma collection, filtrable ; avec une Légende, seulement les cartes jouables dans ses domaines (décochable). */
function SelecteurCollection({ deck, legende, surChoix }: { deck: ContenuDeck; legende: Carte | undefined; surChoix: (c: CartePossedee) => void }) {
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [recherche, setRecherche] = useState("");
  const [rechercheAppliquee, setRechercheAppliquee] = useState("");
  const [filtreSet, setFiltreSet] = useState("");
  const [type, setType] = useState("");
  const [rarete, setRarete] = useState("");
  const [variante, setVariante] = useState("");
  const [tri, setTri] = useState("rarete-desc");
  const [compatibles, setCompatibles] = useState(true);
  const [page, setPage] = useState(1);
  const [resultat, setResultat] = useState<ReponseCollection | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const domaines = useMemo(() => (legende ? domainesDe(legende).join(",") : ""), [legende]);

  useEffect(() => {
    appelerApi<{ parSet: Array<{ code: string; nom: string; total: number }> }>("GET", "/collection/resume").then(
      (r) => setSets(r.parSet.map((s) => ({ code: s.code, nom: s.nom, ouvrable: true, nbCartes: s.total }))),
      () => undefined,
    );
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setRechercheAppliquee(recherche.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [recherche]);

  useEffect(() => {
    const p = new URLSearchParams({ page: String(page) });
    if (filtreSet) p.set("set", filtreSet);
    if (type) p.set("type", type);
    if (rarete) p.set("rarete", rarete);
    if (variante) p.set("variante", variante);
    if (tri) p.set("tri", tri);
    if (rechercheAppliquee) p.set("recherche", rechercheAppliquee);
    if (compatibles && domaines) p.set("domaines", domaines);
    appelerApi<ReponseCollection>("GET", `/collection?${p.toString()}`).then(
      (r) => {
        setResultat(r);
        setErreur(null);
      },
      (e: Error) => setErreur(e.message),
    );
  }, [filtreSet, type, rarete, variante, tri, rechercheAppliquee, compatibles, domaines, page]);

  const changer = (maj: () => void) => {
    maj();
    setPage(1);
  };
  const nbPages = resultat ? Math.max(1, Math.ceil(resultat.total / resultat.parPage)) : 1;

  return (
    <section className="selecteur-deck">
      <FiltresCartes
        sets={sets}
        recherche={recherche}
        surRecherche={setRecherche}
        set={filtreSet}
        surSet={(v) => changer(() => setFiltreSet(v))}
        type={type}
        surType={(v) => changer(() => setType(v))}
        rarete={rarete}
        surRarete={(v) => changer(() => setRarete(v))}
        variante={variante}
        surVariante={(v) => changer(() => setVariante(v))}
        tri={tri}
        surTri={(v) => changer(() => setTri(v))}
      >
        {legende && (
          <label className="bascule">
            <input type="checkbox" checked={compatibles} onChange={(e) => changer(() => setCompatibles(e.target.checked))} /> Seulement
            les cartes jouables avec ma Légende
          </label>
        )}
      </FiltresCartes>
      {!legende && <p className="aide">Commence par choisir une Légende (filtre Type → Légende).</p>}
      {erreur && <p className="message-erreur">{erreur}</p>}
      {resultat && resultat.total === 0 && <p className="aide">Aucune carte de ta collection ne correspond.</p>}
      {resultat && nbPages > 1 && <Pagination page={page} nbPages={nbPages} allerA={setPage} />}
      <div className="grille-cartes grille-compacte">
        {resultat?.cartes.map((c) => {
          const possedees = c.quantite + c.quantiteFoil;
          const utilises = exemplairesUtilises(deck, c.code);
          return (
            <button
              key={c.code}
              className={`vignette-carte ${classeRarete(c)} ${utilises >= possedees ? "vignette-epuisee" : ""}`}
              onClick={() => surChoix(c)}
              title={`Ajouter ${c.nom}`}
            >
              <span className="cadre-carte">
                <ImageCarte className={c.orientation === "paysage" ? "image-paysage" : undefined} image={c.image} largeur={300} alt={c.nom} paresseuse />
                <span className="badge-quantite">
                  {utilises}/{possedees}
                </span>
              </span>
              <span className="legende-carte">
                {c.nom}
                <small>{libelleRarete(c)}</small>
              </span>
            </button>
          );
        })}
      </div>
      {resultat && nbPages > 1 && <Pagination page={page} nbPages={nbPages} allerA={setPage} />}
    </section>
  );
}
