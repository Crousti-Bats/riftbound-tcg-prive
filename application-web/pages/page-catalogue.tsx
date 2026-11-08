/** Catalogue de toutes les cartes : filtres par set, rareté, variante et recherche ; fiche détaillée. */
import { useEffect, useState } from "react";
import { appelerApi } from "../outils/appels-api";
import {
  type Carte,
  classeRarete,
  LIBELLES_RARETE,
  LIBELLES_TYPE,
  LIBELLES_VARIANTE,
  type SetInfo,
  urlImage,
} from "../outils/libelles-cartes";
import { naviguer } from "../outils/navigation";

interface ReponseCartes {
  cartes: Carte[];
  total: number;
  page: number;
  parPage: number;
}

export function PageCatalogue() {
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [filtreSet, setFiltreSet] = useState("");
  const [rarete, setRarete] = useState("");
  const [variante, setVariante] = useState("");
  const [typeCarte, setTypeCarte] = useState("");
  const [recherche, setRecherche] = useState("");
  const [rechercheAppliquee, setRechercheAppliquee] = useState("");
  const [page, setPage] = useState(1);
  const [resultat, setResultat] = useState<ReponseCartes | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [selection, setSelection] = useState<Carte | null>(null);

  useEffect(() => {
    appelerApi<{ sets: SetInfo[] }>("GET", "/catalogue/sets").then(
      (r) => setSets(r.sets),
      (e: Error) => setErreur(e.message),
    );
  }, []);

  // La recherche texte s'applique 300 ms après la dernière frappe.
  useEffect(() => {
    const minuteur = setTimeout(() => {
      setRechercheAppliquee(recherche.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(minuteur);
  }, [recherche]);

  useEffect(() => {
    const parametres = new URLSearchParams({ page: String(page) });
    if (filtreSet) parametres.set("set", filtreSet);
    if (rarete) parametres.set("rarete", rarete);
    if (variante) parametres.set("variante", variante);
    if (typeCarte) parametres.set("type", typeCarte);
    if (rechercheAppliquee) parametres.set("recherche", rechercheAppliquee);
    appelerApi<ReponseCartes>("GET", `/catalogue/cartes?${parametres.toString()}`).then(
      (r) => {
        setResultat(r);
        setErreur(null);
      },
      (e: Error) => setErreur(e.message),
    );
  }, [filtreSet, rarete, variante, typeCarte, rechercheAppliquee, page]);

  const nbPages = resultat ? Math.max(1, Math.ceil(resultat.total / resultat.parPage)) : 1;
  const changerFiltre = (maj: () => void) => {
    maj();
    setPage(1);
  };

  return (
    <main className="conteneur">
      <header className="entete">
        <h1>Catalogue</h1>
        <nav className="barre-actions">
          <button className="secondaire" onClick={() => naviguer("/")}>Retour</button>
        </nav>
      </header>

      <section className="carte filtres">
        <label>
          Recherche
          <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="ex. Jinx, Fury, Spell…" maxLength={50} />
        </label>
        <label>
          Set
          <select value={filtreSet} onChange={(e) => changerFiltre(() => setFiltreSet(e.target.value))}>
            <option value="">Tous les sets</option>
            {sets.map((s) => (
              <option key={s.code} value={s.code}>{s.nom} ({s.nbCartes})</option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select value={typeCarte} onChange={(e) => changerFiltre(() => setTypeCarte(e.target.value))}>
            <option value="">Tous les types</option>
            {Object.entries(LIBELLES_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>
          Rareté
          <select value={rarete} onChange={(e) => changerFiltre(() => setRarete(e.target.value))}>
            <option value="">Toutes</option>
            {Object.entries(LIBELLES_RARETE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>
          Variante
          <select value={variante} onChange={(e) => changerFiltre(() => setVariante(e.target.value))}>
            <option value="">Toutes</option>
            {Object.entries(LIBELLES_VARIANTE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </section>

      {erreur && <p className="message-erreur">{erreur}</p>}
      {!resultat && !erreur && <p className="aide">Chargement du catalogue…</p>}
      {resultat && (
        <div className="barre-resultats">
          <p className="aide">
            {resultat.total} carte(s){nbPages > 1 ? ` · ${resultat.parPage} par page` : ""}
          </p>
          {nbPages > 1 && <Pagination page={page} nbPages={nbPages} allerA={setPage} />}
        </div>
      )}

      <section className="grille-cartes">
        {resultat?.cartes.map((carte) => (
          <button key={carte.code} className={`vignette-carte ${classeRarete(carte)}`} onClick={() => setSelection(carte)} title={carte.nom}>
            <span className="cadre-carte">
              {/* Les Battlefields (paysage) sont tournés d'un quart de tour pour rester alignés, sans déformation. */}
              <img className={carte.orientation === "paysage" ? "image-paysage" : undefined} src={urlImage(carte.image, 300)} alt={carte.nom} loading="lazy" />
            </span>
            <span className="legende-carte">
              {carte.nom}
              <small>{LIBELLES_VARIANTE[carte.variante] === "Normale" ? LIBELLES_RARETE[carte.rarete] : LIBELLES_VARIANTE[carte.variante]}</small>
            </span>
          </button>
        ))}
      </section>

      {resultat && nbPages > 1 && (
        <Pagination
          page={page}
          nbPages={nbPages}
          allerA={(p) => {
            setPage(p);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {selection && <FicheCarte carte={selection} nomSet={sets.find((s) => s.code === selection.set)?.nom ?? selection.set} surFermeture={() => setSelection(null)} />}
    </main>
  );
}

function Pagination({ page, nbPages, allerA }: { page: number; nbPages: number; allerA: (page: number) => void }) {
  return (
    <nav className="pagination" aria-label="Pages">
      <button className="secondaire petit" disabled={page <= 1} onClick={() => allerA(page - 1)} aria-label="Page précédente">←</button>
      <select value={page} onChange={(e) => allerA(Number(e.target.value))} aria-label="Choisir la page">
        {Array.from({ length: nbPages }, (_, i) => (
          <option key={i + 1} value={i + 1}>Page {i + 1} / {nbPages}</option>
        ))}
      </select>
      <button className="secondaire petit" disabled={page >= nbPages} onClick={() => allerA(page + 1)} aria-label="Page suivante">→</button>
    </nav>
  );
}

function FicheCarte({ carte, nomSet, surFermeture }: { carte: Carte; nomSet: string; surFermeture: () => void }) {
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === "Escape" && surFermeture();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [surFermeture]);

  return (
    <div className="fond-modale" onClick={surFermeture} role="presentation">
      <div
        className={`modale ${carte.orientation === "paysage" ? "modale-paysage" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={carte.nom}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          className={`image-fiche ${classeRarete(carte)}`}
          src={urlImage(carte.image, carte.orientation === "paysage" ? 1039 : 744)}
          alt={carte.nom}
        />
        <div className="details-fiche">
          <h2>{carte.nom}{carte.sousTitre ? `, ${carte.sousTitre}` : ""}</h2>
          <p className="aide">{nomSet} · n° {carte.numero}</p>
          <dl>
            <dt>Rareté</dt><dd>{LIBELLES_RARETE[carte.rarete] ?? carte.rarete}</dd>
            <dt>Variante</dt><dd>{LIBELLES_VARIANTE[carte.variante] ?? carte.variante}</dd>
            <dt>Type</dt><dd>{carte.type}</dd>
            {carte.domaines.length > 0 && <><dt>Domaine</dt><dd>{carte.domaines.join(", ")}</dd></>}
            {carte.energie !== null && <><dt>Énergie</dt><dd>{carte.energie}</dd></>}
            {carte.puissance !== null && <><dt>Puissance</dt><dd>{carte.puissance}</dd></>}
            {carte.force !== null && <><dt>Might</dt><dd>{carte.force}</dd></>}
            {carte.artiste && <><dt>Artiste</dt><dd>{carte.artiste}</dd></>}
          </dl>
          {carte.texte && <p className="texte-carte">{carte.texte}</p>}
          <button onClick={surFermeture}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
