/** « Recycler mes doublons » : récapitulatif de tout ce qui part (et de ce que ça rapporte), puis confirmation. */
import { useEffect, useState } from "react";
import { ImageCarte } from "./image-carte";
import { appelerApi } from "../outils/appels-api";
import { chargerEclats, type EtatEclats, formaterEclats, publierSolde } from "../outils/eclats";
import { classeRarete, libelleRarete } from "../outils/libelles-cartes";

export function RecyclageDoublons({ surFermeture, surRecyclage }: { surFermeture: () => void; surRecyclage: () => void }) {
  const [etat, setEtat] = useState<EtatEclats | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<{ gain: number; exemplaires: number; solde: number } | null>(null);

  useEffect(() => {
    chargerEclats().then(setEtat, (e: Error) => setErreur(e.message));
  }, []);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === "Escape" && surFermeture();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [surFermeture]);

  const recycler = () => {
    setEnCours(true);
    setErreur(null);
    appelerApi<{ gain: number; exemplaires: number; solde: number }>("POST", "/eclats/recycler", {})
      .then((r) => {
        publierSolde(r.solde);
        setResultat(r);
        surRecyclage();
      })
      .catch((e: Error) => setErreur(e.message))
      .finally(() => setEnCours(false));
  };

  const doublons = etat?.doublons;
  return (
    <div className="fond-modale" onClick={surFermeture} role="presentation">
      <div className="modale modale-recyclage" role="dialog" aria-modal="true" aria-label="Recycler mes doublons" onClick={(e) => e.stopPropagation()}>
        <h2>♻ Recycler mes doublons</h2>
        <p className="aide">
          On garde toujours 1 exemplaire de chaque carte, et autant que ton deck qui en utilise le plus. Les normales partent avant
          les foils. Runes et tokens ne sont jamais recyclés.
        </p>

        {!etat && !erreur && <p className="aide">Chargement…</p>}
        {resultat ? (
          <p className="message-succes">
            {resultat.exemplaires} carte{resultat.exemplaires > 1 ? "s" : ""} recyclée{resultat.exemplaires > 1 ? "s" : ""} : +
            {formaterEclats(resultat.gain)}. Tu as maintenant <strong>{formaterEclats(resultat.solde)}</strong>.
          </p>
        ) : (
          doublons && (
            <>
              {doublons.cartes.length === 0 ? (
                <p className="aide">Aucun doublon à recycler pour l'instant.</p>
              ) : (
                <>
                  <p>
                    <strong>{doublons.exemplaires}</strong> carte{doublons.exemplaires > 1 ? "s" : ""} en trop → <strong>+{formaterEclats(doublons.eclats)}</strong>
                  </p>
                  <ul className="liste-recyclage">
                    {doublons.cartes.map((c) => (
                      <li key={c.code}>
                        <ImageCarte className={`miniature-recyclage ${classeRarete(c)}`} image={c.image} largeur={300} alt="" paresseuse />
                        <span>
                          {c.nom}
                          <small className="aide">
                            {libelleRarete(c)}
                            {c.doublons.normale > 0 ? ` · ×${c.doublons.normale}` : ""}
                            {c.doublons.foil > 0 ? ` · ×${c.doublons.foil} foil ✨` : ""}
                          </small>
                        </span>
                        <strong>+{formaterEclats(c.eclats)}</strong>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )
        )}
        {erreur && <p className="message-erreur">{erreur}</p>}

        <div className="actions-fiche">
          {!resultat && doublons && doublons.cartes.length > 0 && (
            <button onClick={recycler} disabled={enCours}>
              {enCours ? "Recyclage…" : `Tout recycler (+${formaterEclats(doublons.eclats)})`}
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
