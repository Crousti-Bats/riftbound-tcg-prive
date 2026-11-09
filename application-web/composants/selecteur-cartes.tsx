/**
 * Parcourt une collection (la mienne ou celle d'un autre joueur) avec les filtres habituels,
 * et permet d'ajouter des cartes à une proposition d'échange (version normale ou foil).
 */
import { ImageCarte } from "./image-carte";
import { useEffect, useState } from "react";
import { appelerApi } from "../outils/appels-api";
import { cleLigne } from "../outils/echanges";
import { type CartePossedee, classeRarete, type SetInfo } from "../outils/libelles-cartes";
import { FiltresCartes } from "./filtres-cartes";
import { Pagination } from "./pagination";

interface ReponseCollection {
  cartes: CartePossedee[];
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
}

export function SelecteurCartes({ source, sets, dejaChoisi, surAjout }: Props) {
  const [filtreSet, setFiltreSet] = useState("");
  const [rarete, setRarete] = useState("");
  const [variante, setVariante] = useState("");
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
    if (typeCarte) parametres.set("type", typeCarte);
    if (rechercheAppliquee) parametres.set("recherche", rechercheAppliquee);
    appelerApi<ReponseCollection>("GET", `${source}?${parametres.toString()}`).then(
      (r) => {
        setResultat(r);
        setErreur(null);
      },
      (e: Error) => setErreur(e.message),
    );
  }, [source, filtreSet, rarete, variante, typeCarte, rechercheAppliquee, page]);

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
      />
      {erreur && <p className="message-erreur">{erreur}</p>}
      {!resultat && !erreur && <p className="aide">Chargement…</p>}
      {resultat && resultat.total === 0 && <p className="aide">Aucune carte.</p>}
      {resultat && nbPages > 1 && <Pagination page={page} nbPages={nbPages} allerA={setPage} />}

      <section className="grille-cartes grille-compacte">
        {resultat?.cartes.map((carte) => {
          const resteNormale = carte.quantite - (dejaChoisi.get(cleLigne(carte.code, false)) ?? 0);
          const resteFoil = carte.quantiteFoil - (dejaChoisi.get(cleLigne(carte.code, true)) ?? 0);
          return (
            <div key={carte.code} className={`vignette-carte ${classeRarete(carte)}`} title={carte.nom}>
              <span className={`cadre-carte ${carte.quantiteFoil > 0 ? "voile-foil" : ""}`}>
                <ImageCarte
                  className={carte.orientation === "paysage" ? "image-paysage" : undefined}
                  image={carte.image}
                  largeur={300}
                  alt={carte.nom}
                  paresseuse
                />
                <span className="badge-quantite">×{carte.quantite + carte.quantiteFoil}</span>
              </span>
              <span className="legende-carte">{carte.nom}</span>
              <span className="boutons-ajout">
                {carte.quantite > 0 && (
                  <button className="petit" disabled={resteNormale <= 0} onClick={() => surAjout(carte, false)}>
                    + Normale ({resteNormale})
                  </button>
                )}
                {carte.quantiteFoil > 0 && (
                  <button className="petit" disabled={resteFoil <= 0} onClick={() => surAjout(carte, true)}>
                    + Foil ✨ ({resteFoil})
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}
