/** Fiche de carte : recycler un exemplaire en trop contre des éclats, ou fabriquer la carte avec ses éclats. */
import { useCallback, useEffect, useState } from "react";
import { appelerApi } from "../outils/appels-api";
import { formaterEclats, publierSolde } from "../outils/eclats";
import { rechargerWishlist } from "../outils/wishlist";

interface InfoCarte {
  solde: number;
  possede: { normale: number; foil: number };
  proteges: number;
  utiliseeDansUnDeck: number;
  recyclables: number;
  valeur: { normale: number; foil: number };
  coutFabrication: number | null;
}

export function ActionsEclats({ code, surChangement }: { code: string; surChangement?: () => void }) {
  const [info, setInfo] = useState<InfoCarte | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(
    () =>
      appelerApi<InfoCarte>("GET", `/eclats/carte/${encodeURIComponent(code)}`).then(
        (r) => {
          setInfo(r);
          publierSolde(r.solde);
        },
        () => setInfo(null),
      ),
    [code],
  );
  useEffect(() => {
    void charger();
  }, [charger]);

  if (!info || info.valeur.normale === 0) return null;

  const agir = <T extends { solde: number }>(requete: Promise<T>, texte: (r: T) => string, wishlist = false) => {
    setEnCours(true);
    setErreur(null);
    setMessage(null);
    requete
      .then(async (r) => {
        publierSolde(r.solde);
        setMessage(texte(r));
        if (wishlist) await rechargerWishlist().catch(() => undefined);
        await charger();
        surChangement?.();
      })
      .catch((e: Error) => setErreur(e.message))
      .finally(() => setEnCours(false));
  };

  const recycler = (foil: boolean) =>
    agir(appelerApi<{ solde: number; gain: number }>("POST", "/eclats/recycler", { code, foil, n: 1 }), (r) => `Recyclée : +${formaterEclats(r.gain)}`);
  const fabriquer = () =>
    agir(appelerApi<{ solde: number }>("POST", "/eclats/fabriquer", { code }), () => "Carte fabriquée et ajoutée à ta collection.", true);

  const { possede, recyclables, valeur, coutFabrication, solde } = info;
  return (
    <div className="eclats-fiche">
      <p className="aide">
        Éclats : <strong>{formaterEclats(solde)}</strong>
        {possede.normale + possede.foil > 0 &&
          (recyclables > 0
            ? ` · ${recyclables} exemplaire${recyclables > 1 ? "s" : ""} en trop`
            : ` · rien à recycler (on garde ${info.proteges}${info.proteges > 1 ? ", utilisée dans un deck" : ""})`)}
      </p>
      <div className="actions-fiche">
        {recyclables > 0 && possede.normale > 0 && (
          <button className="secondaire" disabled={enCours} onClick={() => recycler(false)}>
            ♻ Recycler 1 normale (+{formaterEclats(valeur.normale)})
          </button>
        )}
        {recyclables > 0 && possede.foil > 0 && (
          <button className="secondaire" disabled={enCours} onClick={() => recycler(true)}>
            ♻ Recycler 1 foil ✨ (+{formaterEclats(valeur.foil)})
          </button>
        )}
        {coutFabrication !== null && (
          <button
            className="secondaire"
            disabled={enCours || solde < coutFabrication}
            onClick={fabriquer}
            title={solde < coutFabrication ? `Il te manque ${formaterEclats(coutFabrication - solde)}` : "Ajoute 1 exemplaire normal à ta collection"}
          >
            🔨 Fabriquer ({formaterEclats(coutFabrication)})
          </button>
        )}
      </div>
      {message && <p className="message-succes">{message}</p>}
      {erreur && <p className="message-erreur">{erreur}</p>}
    </div>
  );
}
