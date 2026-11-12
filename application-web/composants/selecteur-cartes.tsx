/**
 * Parcourt une collection (la mienne ou celle d'un autre joueur) avec les filtres habituels,
 * et permet d'ajouter des cartes à une proposition d'échange (version normale ou foil).
 */
import { ImageCarte } from "./image-carte";
import { type KeyboardEvent, useEffect, useState } from "react";
import { appelerApi } from "../outils/appels-api";
import { cleLigne } from "../outils/echanges";
import { type CartePossedee, classeRarete, libelleRarete, type SetInfo } from "../outils/libelles-cartes";
import { FiltresCartes } from "./filtres-cartes";
import { Pagination } from "./pagination";

/** Carte possédée, avec, en préparation d'échange, le nombre d'exemplaires chez l'autre joueur. */
type CarteComparee = CartePossedee & { chezAutre?: number };

interface ReponseCollection {
  cartes: CarteComparee[];
  total: number;
  page: number;
  parPage: number;
}

interface Props {
  /** "/collection" pour la mienne, "/collection/joueur/<pseudo>" pour celle d'un autre. */
  source: string;
  sets: SetInfo[];
  /** Quantités déjà mises dans la proposition, par clé code|foil. */
  dejaChoisi: Map<string, number>;
  surAjout: (carte: CartePossedee, foil: boolean) => void;
  /**
   * "echange" (par défaut) : un bouton par version, avec le nombre d'exemplaires restants.
   * "vitrine" : une seule fois chaque version. "avatar" : un seul bouton « Choisir », foil ou non.
   */
  mode?: "echange" | "vitrine" | "avatar";
  /**
   * Échange : compare avec l'autre collection. `parametre` est ajouté à la requête (`comparer=<pseudo>` ou
   * `comparer=1`) ; `manque` est le badge d'une carte que l'autre n'a pas (« Il ne l'a pas », « Tu ne l'as pas »).
   */
  comparaison?: { parametre: string; manque: string; filtre: string };
}

export function SelecteurCartes({ source, sets, dejaChoisi, surAjout, mode = "echange", comparaison }: Props) {
  const [seulementManquantes, setSeulementManquantes] = useState(false);
  // Chaîne plutôt qu'objet dans les dépendances : l'objet `comparaison` est recréé à chaque rendu du parent.
  const parametreComparaison = comparaison?.parametre;
  const [filtreSet, setFiltreSet] = useState("");
  const [rarete, setRarete] = useState("");
  const [variante, setVariante] = useState("");
  const [tri, setTri] = useState("rarete-desc");
  const [typeCarte, setTypeCarte] = useState("");
  const [recherche, setRecherche] = useState("");
  const [rechercheAppliquee, setRechercheAppliquee] = useState("");
  const [page, setPage] = useState(1);
  const [resultat, setResultat] = useState<ReponseCollection | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

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
    if (parametreComparaison) {
      const [cle, valeur] = parametreComparaison.split("=");
      if (cle && valeur) parametres.set(cle, valeur);
      if (seulementManquantes) parametres.set("manquantes", "1");
    }
    if (typeCarte) parametres.set("type", typeCarte);
    if (rechercheAppliquee) parametres.set("recherche", rechercheAppliquee);
    appelerApi<ReponseCollection>("GET", `${source}?${parametres.toString()}`).then(
      (r) => {
        setResultat(r);
        setErreur(null);
      },
      (e: Error) => setErreur(e.message),
    );
  }, [source, filtreSet, rarete, variante, tri, typeCarte, rechercheAppliquee, page, parametreComparaison, seulementManquantes]);

  const nbPages = resultat ? Math.max(1, Math.ceil(resultat.total / resultat.parPage)) : 1;
  const changerFiltre = (maj: () => void) => {
    maj();
    setPage(1);
  };

  return (
    <div className="selecteur-cartes">
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
        triQuantite
      >
        {comparaison && (
          <label className="bascule">
            <input type="checkbox" checked={seulementManquantes} onChange={(e) => changerFiltre(() => setSeulementManquantes(e.target.checked))} />{" "}
            {comparaison.filtre}
          </label>
        )}
      </FiltresCartes>
      {erreur && <p className="message-erreur">{erreur}</p>}
      {!resultat && !erreur && <p className="aide">Chargement…</p>}
      {resultat && resultat.total === 0 && <p className="aide">Aucune carte.</p>}
      {resultat && nbPages > 1 && <Pagination page={page} nbPages={nbPages} allerA={setPage} />}

      <section className="grille-cartes grille-compacte">
        {resultat?.cartes.map((carte) => {
          const resteNormale = carte.quantite - (dejaChoisi.get(cleLigne(carte.code, false)) ?? 0);
          const resteFoil = carte.quantiteFoil - (dejaChoisi.get(cleLigne(carte.code, true)) ?? 0);
          const dansEchange = (dejaChoisi.get(cleLigne(carte.code, false)) ?? 0) + (dejaChoisi.get(cleLigne(carte.code, true)) ?? 0);
          // Échange : un clic sur la carte ajoute un exemplaire normal (ou foil s'il ne reste que des foil).
          const ajoutDirect = mode === "echange" ? (resteNormale > 0 ? false : resteFoil > 0 ? true : null) : null;
          const ajouterEnCliquant = () => {
            if (ajoutDirect !== null) surAjout(carte, ajoutDirect);
          };
          return (
            <div key={carte.code} className={`vignette-carte ${classeRarete(carte)} ${mode === "echange" ? "vignette-cliquable" : ""} ${ajoutDirect === null && mode === "echange" ? "vignette-epuisee" : ""}`} title={carte.nom}>
              <span
                className={`cadre-carte ${carte.quantiteFoil > 0 ? "voile-foil" : ""}`}
                {...(mode === "echange"
                  ? {
                      role: "button",
                      tabIndex: ajoutDirect === null ? -1 : 0,
                      "aria-disabled": ajoutDirect === null,
                      "aria-label": `Ajouter ${carte.nom} à l'échange`,
                      onClick: ajouterEnCliquant,
                      onKeyDown: (e: KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          ajouterEnCliquant();
                        }
                      },
                    }
                  : {})}
              >
                <ImageCarte
                  className={carte.orientation === "paysage" ? "image-paysage" : undefined}
                  image={carte.image}
                  largeur={300}
                  alt={carte.nom}
                  paresseuse
                />
                <span className="badge-quantite">×{carte.quantite + carte.quantiteFoil}</span>
                {comparaison && carte.chezAutre === 0 && <span className="badge-manque">{comparaison.manque}</span>}
                {dansEchange > 0 && <span className="badge-dans-echange">+{dansEchange} dans l'échange</span>}
                {mode === "echange" && ajoutDirect !== null && (
                  <span className="indice-ajout" aria-hidden="true">
                    +
                  </span>
                )}
              </span>
              <span className="legende-carte">
                {carte.nom}
                <small>{libelleRarete(carte)}</small>
              </span>
              {mode === "echange" ? (
                // Le clic sur la carte ajoute une normale ; un bouton reste pour la version foil quand il y a les deux.
                carte.quantite > 0 &&
                carte.quantiteFoil > 0 && (
                  <span className="boutons-ajout">
                    <button className="petit secondaire" disabled={resteFoil <= 0} onClick={() => surAjout(carte, true)}>
                      + Foil ✨ ({resteFoil})
                    </button>
                  </span>
                )
              ) : mode === "vitrine" ? (
                <span className="boutons-ajout">
                  {carte.quantite > 0 && (
                    <button className="petit" disabled={dejaChoisi.has(cleLigne(carte.code, false))} onClick={() => surAjout(carte, false)}>
                      Exposer
                    </button>
                  )}
                  {carte.quantiteFoil > 0 && (
                    <button className="petit" disabled={dejaChoisi.has(cleLigne(carte.code, true))} onClick={() => surAjout(carte, true)}>
                      Exposer en foil ✨
                    </button>
                  )}
                </span>
              ) : (
                <span className="boutons-ajout">
                  <button className="petit" disabled={dejaChoisi.has(carte.code)} onClick={() => surAjout(carte, false)}>
                    {dejaChoisi.has(carte.code) ? "Avatar actuel" : "Choisir"}
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
