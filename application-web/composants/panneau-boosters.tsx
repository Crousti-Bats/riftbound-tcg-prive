/** Hub d'ouverture : stock de boosters, minuteur du prochain, choix du set, bouton Ouvrir, puis l'overlay de révélation. */
import { useCallback, useEffect, useRef, useState } from "react";
import { OuvertureBooster } from "./ouverture-booster";
import { appelerApi } from "../outils/appels-api";
import { type CarteOuverte, formaterDuree } from "../outils/libelles-cartes";

interface Stock {
  actuel: number;
  max: number;
  prochainDansMs: number | null;
}
interface EtatBoosters {
  stock: Stock;
  sets: Array<{ code: string; nom: string }>;
}

const dateProchain = (stock: Stock) => (stock.prochainDansMs == null ? null : Date.now() + stock.prochainDansMs);

export function PanneauBoosters() {
  const [etat, setEtat] = useState<EtatBoosters | null>(null);
  const [set, setSet] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [prochaineA, setProchaineA] = useState<number | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [enOuverture, setEnOuverture] = useState(false);
  const fermer = useCallback(() => setEnOuverture(false), []);
  const rechargement = useRef(false);

  const appliquerEtat = useCallback((e: EtatBoosters) => {
    setEtat(e);
    setSet((prev) => prev || e.sets[0]?.code || "");
    setProchaineA(dateProchain(e.stock));
    setErreur(null);
  }, []);

  // Style .then(setState) : le linter interdit un setState synchrone dans le corps d'un effet.
  const rafraichir = useCallback(
    () => appelerApi<EtatBoosters>("GET", "/boosters/etat").then(appliquerEtat, (e: Error) => setErreur(e.message)),
    [appliquerEtat],
  );

  useEffect(() => {
    void rafraichir();
  }, [rafraichir]);

  // Horloge : un tick par seconde (setState dans le callback de l'intervalle, pas dans le corps de l'effet).
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const restantMs = prochaineA == null ? null : Math.max(0, prochaineA - maintenant);

  // Quand le minuteur atteint zéro, on relit l'état (un booster de plus). Un verrou évite les appels répétés.
  useEffect(() => {
    if (prochaineA != null && prochaineA - maintenant <= 0 && !rechargement.current) {
      rechargement.current = true;
      void rafraichir().finally(() => {
        rechargement.current = false;
      });
    }
  }, [prochaineA, maintenant, rafraichir]);

  // Le serveur tire les cartes quand le booster se déchire dans la scène d'ouverture (pas au clic sur le bouton).
  const ouvrirSetChoisi = useCallback(
    () =>
      appelerApi<{ cartes: CarteOuverte[]; stock: Stock }>("POST", "/boosters/ouvrir", { set }).then((r) => {
        setEtat((prev) => (prev ? { ...prev, stock: r.stock } : prev));
        setProchaineA(dateProchain(r.stock));
        return r.cartes;
      }),
    [set],
  );

  const stock = etat?.stock;

  return (
    <section className="carte panneau-boosters">
      <h2>Ouvrir un booster</h2>
      {!etat && !erreur && <p className="aide">Chargement…</p>}
      {etat && (
        <>
          <p className="stock-boosters">
            <span className="stock-nombre">{stock?.actuel ?? 0}</span>
            <span className="aide"> / {stock?.max ?? 15} boosters</span>
          </p>
          <p className="aide">
            {stock && stock.actuel >= stock.max ? "Stock plein." : `Prochain booster dans ${formaterDuree(restantMs)}.`}
          </p>
          <div className="barre-actions">
            <label className="choix-set">
              Set
              <select value={set} onChange={(e) => setSet(e.target.value)}>
                {etat.sets.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.nom}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => setEnOuverture(true)} disabled={!set || (stock?.actuel ?? 0) < 1}>
              Ouvrir un booster
            </button>
          </div>
        </>
      )}
      {erreur && <p className="message-erreur">{erreur}</p>}

      {enOuverture && set && (
        <OuvertureBooster
          set={set}
          nomSet={etat?.sets.find((s) => s.code === set)?.nom ?? set}
          ouvrir={ouvrirSetChoisi}
          peutOuvrirAutre={(stock?.actuel ?? 0) >= 1}
          surFermer={fermer}
        />
      )}
    </section>
  );
}
