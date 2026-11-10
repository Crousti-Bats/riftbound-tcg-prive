/** Catalogue de toutes les cartes : filtres par set, rareté, variante et recherche ; fiche détaillée. */
import { ImageCarte } from "../composants/image-carte";
import { useEffect, useState } from "react";
import { FicheCarte } from "../composants/fiche-carte";
import { FiltresCartes } from "../composants/filtres-cartes";
import { Pagination } from "../composants/pagination";
import { appelerApi } from "../outils/appels-api";
import { type Carte, classeRarete, libelleRarete, type SetInfo } from "../outils/libelles-cartes";

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
  const [tri, setTri] = useState("");
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
    if (tri) parametres.set("tri", tri);
    if (typeCarte) parametres.set("type", typeCarte);
    if (rechercheAppliquee) parametres.set("recherche", rechercheAppliquee);
    appelerApi<ReponseCartes>("GET", `/catalogue/cartes?${parametres.toString()}`).then(
      (r) => {
        setResultat(r);
        setErreur(null);
      },
      (e: Error) => setErreur(e.message),
    );
  }, [filtreSet, rarete, variante, tri, typeCarte, rechercheAppliquee, page]);

  const nbPages = resultat ? Math.max(1, Math.ceil(resultat.total / resultat.parPage)) : 1;
  const changerFiltre = (maj: () => void) => {
    maj();
    setPage(1);
  };

  return (
    <main className="conteneur">
      <header className="entete">
        <h1>Catalogue</h1>
      </header>

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
      />

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
          <button
            key={carte.code}
            className={`vignette-carte ${classeRarete(carte)}`}
            onClick={() => setSelection(carte)}
            title={carte.nom}
          >
            <span className="cadre-carte">
              {/* Les Battlefields (paysage) sont tournés d'un quart de tour pour rester alignés, sans déformation. */}
              <ImageCarte
                className={carte.orientation === "paysage" ? "image-paysage" : undefined}
                image={carte.image}
                largeur={300}
                alt={carte.nom}
                paresseuse
              />
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
          surFermeture={() => setSelection(null)}
        />
      )}
    </main>
  );
}
