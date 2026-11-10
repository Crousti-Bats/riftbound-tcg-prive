/** Ma collection : cartes possédées, quantités, foil, complétion par set, mêmes filtres que le catalogue. */
import { ImageCarte } from "../composants/image-carte";
import { useEffect, useMemo, useState } from "react";
import { FicheCarte } from "../composants/fiche-carte";
import { FiltresCartes } from "../composants/filtres-cartes";
import { Pagination } from "../composants/pagination";
import { appelerApi } from "../outils/appels-api";
import { type CartePossedee, classeRarete, libelleRarete, type SetInfo } from "../outils/libelles-cartes";
import { naviguer } from "../outils/navigation";

interface ReponseCollection {
  cartes: CartePossedee[];
  total: number;
  page: number;
  parPage: number;
}
interface Resume {
  totalCartes: number;
  cartesDistinctes: number;
  parSet: Array<{ code: string; nom: string; possedees: number; total: number }>;
}

export function PageCollection() {
  const [resume, setResume] = useState<Resume | null>(null);
  const [filtreSet, setFiltreSet] = useState("");
  const [rarete, setRarete] = useState("");
  const [variante, setVariante] = useState("");
  const [tri, setTri] = useState("");
  const [typeCarte, setTypeCarte] = useState("");
  const [recherche, setRecherche] = useState("");
  const [rechercheAppliquee, setRechercheAppliquee] = useState("");
  const [foil, setFoil] = useState(false);
  const [doublons, setDoublons] = useState(false);
  const [page, setPage] = useState(1);
  const [resultat, setResultat] = useState<ReponseCollection | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [selection, setSelection] = useState<CartePossedee | null>(null);

  useEffect(() => {
    appelerApi<Resume>("GET", "/collection/resume").then(setResume, (e: Error) => setErreur(e.message));
  }, []);

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
    if (tri) parametres.set("tri", tri);
    if (typeCarte) parametres.set("type", typeCarte);
    if (rechercheAppliquee) parametres.set("recherche", rechercheAppliquee);
    if (foil) parametres.set("foil", "1");
    if (doublons) parametres.set("doublons", "1");
    appelerApi<ReponseCollection>("GET", `/collection?${parametres.toString()}`).then(
      (r) => {
        setResultat(r);
        setErreur(null);
      },
      (e: Error) => setErreur(e.message),
    );
  }, [filtreSet, rarete, variante, tri, typeCarte, rechercheAppliquee, foil, doublons, page]);

  const sets = useMemo<SetInfo[]>(
    () => (resume?.parSet ?? []).map((s) => ({ code: s.code, nom: s.nom, ouvrable: true, nbCartes: s.total })),
    [resume],
  );
  const nbPages = resultat ? Math.max(1, Math.ceil(resultat.total / resultat.parPage)) : 1;
  const changerFiltre = (maj: () => void) => {
    maj();
    setPage(1);
  };

  return (
    <main className="conteneur">
      <header className="entete">
        <h1>Ma collection</h1>
      </header>

      {resume && (
        <section className="carte resume-collection">
          <div className="chiffres-collection">
            <p>
              <strong>{resume.totalCartes}</strong>
              <span>carte{resume.totalCartes > 1 ? "s" : ""}</span>
            </p>
            <p>
              <strong>{resume.cartesDistinctes}</strong>
              <span>différente{resume.cartesDistinctes > 1 ? "s" : ""}</span>
            </p>
          </div>
          <div className="completion">
            {resume.parSet
              .filter((s) => s.total > 0)
              .map((s) => (
                <div key={s.code} className="completion-set">
                  <span className="aide">
                    {s.nom} — {s.possedees}/{s.total}
                  </span>
                  <span className="barre-completion">
                    <span className="barre-completion-remplie" style={{ width: `${(s.possedees / s.total) * 100}%` }} />
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      <FiltresCartes
        sets={sets}
        recherche={recherche}
        surRecherche={setRecherche}
        set={filtreSet}
        surSet={(v) => changerFiltre(() => setFiltreSet(v))}
        type={typeCarte}
        surType={(v) => changerFiltre(() => setTypeCarte(v))}
        rarete={rarete}
        surRarete={(v) => changerFiltre(() => setRarete(v))}
        variante={variante}
        surVariante={(v) => changerFiltre(() => setVariante(v))}
        tri={tri}
        surTri={(v) => changerFiltre(() => setTri(v))}
      >
        <label className="bascule">
          <input type="checkbox" checked={foil} onChange={(e) => changerFiltre(() => setFoil(e.target.checked))} /> Foil
          uniquement
        </label>
        <label className="bascule">
          <input type="checkbox" checked={doublons} onChange={(e) => changerFiltre(() => setDoublons(e.target.checked))} />{" "}
          Doublons uniquement
        </label>
      </FiltresCartes>

      {erreur && <p className="message-erreur">{erreur}</p>}
      {!resultat && !erreur && <p className="aide">Chargement…</p>}
      {resultat && resultat.total === 0 && (
        <p className="aide">
          Aucune carte ici.{" "}
          <a href="/" onClick={(e) => { e.preventDefault(); naviguer("/"); }}>
            Ouvre un booster !
          </a>
        </p>
      )}
      {resultat && resultat.total > 0 && (
        <div className="barre-resultats">
          <p className="aide">
            {resultat.total} carte(s){nbPages > 1 ? ` · ${resultat.parPage} par page` : ""}
          </p>
          {nbPages > 1 && <Pagination page={page} nbPages={nbPages} allerA={setPage} />}
        </div>
      )}

      <section className="grille-cartes">
        {resultat?.cartes.map((carte) => (
          <button
            key={carte.code}
            className={`vignette-carte ${classeRarete(carte)}`}
            onClick={() => setSelection(carte)}
            title={carte.nom}
          >
            <span className={`cadre-carte ${carte.quantiteFoil > 0 ? "voile-foil" : ""}`}>
              <ImageCarte
                className={carte.orientation === "paysage" ? "image-paysage" : undefined}
                image={carte.image}
                largeur={300}
                alt={carte.nom}
                paresseuse
              />
              <span className="badge-quantite">×{carte.quantite + carte.quantiteFoil}</span>
              {carte.quantiteFoil > 0 && <span className="badge-foil">✨</span>}
            </span>
            <span className="legende-carte">
              {carte.nom}
              <small>{libelleRarete(carte)}</small>
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

      {selection && (
        <FicheCarte
          carte={selection}
          nomSet={sets.find((s) => s.code === selection.set)?.nom ?? selection.set}
          possession={{ quantite: selection.quantite, quantiteFoil: selection.quantiteFoil }}
          surFermeture={() => setSelection(null)}
        />
      )}
    </main>
  );
}
