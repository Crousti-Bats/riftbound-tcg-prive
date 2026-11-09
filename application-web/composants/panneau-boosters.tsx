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

export function PanneauBoosters() {
  const [etat, setEtat] = useState<EtatBoosters | null>(null);
  const [set, setSet] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [prochaineA, setProchaineA] = useState<number | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [cartesOuvertes, setCartesOuvertes] = useState<CarteOuverte[] | null>(null);
  const rechargement = useRef(false);

  const dateProchain = (stock: Stock) => (stock.prochainDansMs == null ? null : Date.now() + stock.prochainDansMs);

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

  function ouvrir() {
    if (!set) return;
    setEnvoi(true);
    setErreur(null);
    appelerApi<{ cartes: CarteOuverte[]; stock: Stock }>("POST", "/boosters/ouvrir", { set })
      .then(
        (r) => {
          setCartesOuvertes(r.cartes);
          setEtat((prev) => (prev ? { ...prev, stock: r.stock } : prev));
          setProchaineA(dateProchain(r.stock));
        },
        (e: Error) => setErreur(e.message),
      )
      .finally(() => setEnvoi(false));
  }

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
            <button onClick={ouvrir} disabled={envoi || !set || (stock?.actuel ?? 0) < 1}>
              {envoi ? "Ouverture…" : "Ouvrir un booster"}
            </button>
          </div>
        </>
      )}
      {erreur && <p className="message-erreur">{erreur}</p>}

      {cartesOuvertes && (
        <OuvertureBooster
          cartes={cartesOuvertes}
          sets={etat?.sets ?? []}
          peutOuvrirAutre={(stock?.actuel ?? 0) >= 1}
          envoi={envoi}
          surOuvrirAutre={ouvrir}
          surFermer={() => setCartesOuvertes(null)}
        />
      )}
    </section>
  );
}
