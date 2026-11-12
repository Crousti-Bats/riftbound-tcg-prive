/**
 * « Recycler mes doublons » : on choisit ce qui part (par rareté, avec ou sans les foils, carte par carte),
 * on voit ce que ça rapporte, puis on confirme.
 */
import { useEffect, useMemo, useState } from "react";
import { ImageCarte } from "./image-carte";
import { appelerApi } from "../outils/appels-api";
import { CATEGORIES_ECLATS, chargerEclats, type DoublonVue, type EtatEclats, formaterEclats, publierSolde } from "../outils/eclats";
import { classeRarete, libelleRarete } from "../outils/libelles-cartes";

/** Ce qui part d'une carte selon le choix « avec ou sans les foils ». */
function partDe(c: DoublonVue, avecFoils: boolean) {
  const foil = avecFoils ? c.doublons.foil : 0;
  return { normale: c.doublons.normale, foil, exemplaires: c.doublons.normale + foil, eclats: c.doublons.normale * c.valeur.normale + foil * c.valeur.foil };
}

export function RecyclageDoublons({ surFermeture, surRecyclage }: { surFermeture: () => void; surRecyclage: () => void }) {
  const [etat, setEtat] = useState<EtatEclats | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<{ gain: number; exemplaires: number; solde: number } | null>(null);
  /** Catégories décochées et cartes décochées une à une. Par défaut, tout est coché. */
  const [categoriesExclues, setCategoriesExclues] = useState<ReadonlySet<string>>(new Set());
  const [cartesExclues, setCartesExclues] = useState<ReadonlySet<string>>(new Set());
  const [avecFoils, setAvecFoils] = useState(true);

  useEffect(() => {
    chargerEclats().then(setEtat, (e: Error) => setErreur(e.message));
  }, []);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === "Escape" && surFermeture();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [surFermeture]);

  const cartes = useMemo(() => etat?.doublons.cartes ?? [], [etat]);
  /** Catégories présentes dans mes doublons, de la moins à la plus précieuse, avec leur total. */
  const categories = useMemo(
    () =>
      CATEGORIES_ECLATS.flatMap(({ code, libelle }) => {
        const duGroupe = cartes.filter((c) => c.categorie === code);
        if (duGroupe.length === 0) return [];
        const parts = duGroupe.map((c) => partDe(c, avecFoils));
        return [{ code, libelle, exemplaires: parts.reduce((n, p) => n + p.exemplaires, 0), eclats: parts.reduce((n, p) => n + p.eclats, 0) }];
      }),
    [cartes, avecFoils],
  );
  const visibles = cartes.filter((c) => !categoriesExclues.has(c.categorie ?? "") && partDe(c, avecFoils).exemplaires > 0);
  const choisies = visibles.filter((c) => !cartesExclues.has(c.code));
  const total = choisies.reduce(
    (t, c) => {
      const p = partDe(c, avecFoils);
      return { exemplaires: t.exemplaires + p.exemplaires, eclats: t.eclats + p.eclats };
    },
    { exemplaires: 0, eclats: 0 },
  );

  const basculer = (ensemble: ReadonlySet<string>, cle: string) => {
    const suivant = new Set(ensemble);
    if (suivant.has(cle)) suivant.delete(cle);
    else suivant.add(cle);
    return suivant;
  };
  /** « Seulement » : ne garder cochée que cette catégorie. */
  const seulement = (code: string) => setCategoriesExclues(new Set(categories.map((c) => c.code).filter((c) => c !== code)));

  const recycler = () => {
    setEnCours(true);
    setErreur(null);
    appelerApi<{ gain: number; exemplaires: number; solde: number }>("POST", "/eclats/recycler", {
      codes: choisies.map((c) => c.code),
      avecFoils,
    })
      .then((r) => {
        publierSolde(r.solde);
        setResultat(r);
        surRecyclage();
      })
      .catch((e: Error) => setErreur(e.message))
      .finally(() => setEnCours(false));
  };

  return (
    <div className="fond-modale" onClick={surFermeture} role="presentation">
      <div className="modale modale-recyclage" role="dialog" aria-modal="true" aria-label="Recycler mes doublons" onClick={(e) => e.stopPropagation()}>
        <h2>♻ Recycler mes doublons</h2>
        <p className="aide">
          On garde toujours 1 exemplaire de chaque carte, et autant que ton deck qui en utilise le plus. Les normales partent avant
          les foils. Runes et tokens ne sont jamais recyclés.
        </p>

        {!etat && !erreur && <p className="aide">Chargement…</p>}
        {resultat && (
          <p className="message-succes">
            {resultat.exemplaires} carte{resultat.exemplaires > 1 ? "s" : ""} recyclée{resultat.exemplaires > 1 ? "s" : ""} : +
            {formaterEclats(resultat.gain)}. Tu as maintenant <strong>{formaterEclats(resultat.solde)}</strong>.
          </p>
        )}
        {!resultat && etat && cartes.length === 0 && <p className="aide">Aucun doublon à recycler pour l'instant.</p>}
        {!resultat && cartes.length > 0 && (
          <>
            <fieldset className="choix-recyclage">
              <legend>Que recycler ?</legend>
              {categories.map((g) => (
                <span key={g.code} className="categorie-recyclage">
                  <label className="bascule">
                    <input
                      type="checkbox"
                      checked={!categoriesExclues.has(g.code)}
                      onChange={() => setCategoriesExclues((e) => basculer(e, g.code))}
                    />{" "}
                    {g.libelle} <small className="aide">×{g.exemplaires} · +{formaterEclats(g.eclats)}</small>
                  </label>
                  <button type="button" className="lien-seulement" onClick={() => seulement(g.code)}>
                    seulement
                  </button>
                </span>
              ))}
              <label className="bascule">
                <input type="checkbox" checked={avecFoils} onChange={(e) => setAvecFoils(e.target.checked)} /> Recycler aussi les foils ✨
              </label>
            </fieldset>

            <ul className="liste-recyclage">
              {visibles.map((c) => {
                const p = partDe(c, avecFoils);
                const coche = !cartesExclues.has(c.code);
                return (
                  <li key={c.code} className={coche ? undefined : "recyclage-exclue"}>
                    <input
                      type="checkbox"
                      checked={coche}
                      onChange={() => setCartesExclues((e) => basculer(e, c.code))}
                      aria-label={`Recycler ${c.nom}`}
                    />
                    <ImageCarte className={`miniature-recyclage ${classeRarete(c)}`} image={c.image} largeur={300} alt="" paresseuse />
                    <span>
                      {c.nom}
                      <small className="aide">
                        {libelleRarete(c)}
                        {p.normale > 0 ? ` · ×${p.normale}` : ""}
                        {p.foil > 0 ? ` · ×${p.foil} foil ✨` : ""}
                      </small>
                    </span>
                    <strong>+{formaterEclats(p.eclats)}</strong>
                  </li>
                );
              })}
            </ul>
            <p>
              Sélection : <strong>{total.exemplaires}</strong> carte{total.exemplaires > 1 ? "s" : ""} → <strong>+{formaterEclats(total.eclats)}</strong>
            </p>
          </>
        )}
        {erreur && <p className="message-erreur">{erreur}</p>}

        <div className="actions-fiche">
          {!resultat && cartes.length > 0 && (
            <button onClick={recycler} disabled={enCours || choisies.length === 0}>
              {enCours ? "Recyclage…" : `Recycler la sélection (+${formaterEclats(total.eclats)})`}
            </button>
          )}
          <button className="secondaire" onClick={surFermeture}>
            {resultat ? "Fermer" : "Annuler"}
          </button>
        </div>
      </div>
    </div>
  );
}
