/** Hub d'ouverture (bandeau principal de l'accueil) : stock de boosters, minuteur du prochain, choix du set, bouton Ouvrir, puis l'overlay de révélation. */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

/** Sets qui ont un fond et des illustrations de booster dans /ouverture/ (booster-<set>-1.webp, -2…). */
const ILLUSTRATIONS_PAR_SET: Record<string, number> = { ogn: 3, sfd: 1, unl: 3, ven: 2, rad: 1 };

/** Une autre illustration que celle affichée la dernière fois (s'il y en a plusieurs). */
function autreIllustration(precedente: number, nombre: number): number {
  if (nombre <= 1) return 1;
  const tirage = 1 + Math.floor(Math.random() * (nombre - 1)); // 1 … nombre-1
  return tirage >= precedente ? tirage + 1 : tirage;
}

const dateProchain = (stock: Stock) => (stock.prochainDansMs == null ? null : Date.now() + stock.prochainDansMs);

export function PanneauBoosters({ pseudo }: { pseudo: string }) {
  const [etat, setEtat] = useState<EtatBoosters | null>(null);
  const [set, setSet] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [prochaineA, setProchaineA] = useState<number | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [enOuverture, setEnOuverture] = useState(false);
  // Illustration affichée pour chaque set : elle change à chaque fois qu'on revient sur le set.
  const [illustrations, setIllustrations] = useState<Record<string, number>>({});
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
  const actuel = stock?.actuel ?? 0;
  const max = stock?.max ?? 15;
  const visuel = set in ILLUSTRATIONS_PAR_SET ? set : "ogn";
  const illustration = illustrations[visuel] ?? 1;

  function choisirSet(code: string) {
    if (code === set) return;
    setSet(code);
    const cle = code in ILLUSTRATIONS_PAR_SET ? code : "ogn";
    setIllustrations({ ...illustrations, [cle]: autreIllustration(illustrations[cle] ?? 1, ILLUSTRATIONS_PAR_SET[cle] ?? 1) });
  }
  const nomSet = etat?.sets.find((s) => s.code === set)?.nom ?? set;
  const peutOuvrir = Boolean(set) && actuel >= 1;

  return (
    <section className="hero-booster" aria-labelledby="titre-boosters">
      <div className="hero-fond" style={{ backgroundImage: `url(/ouverture/fond-${visuel}.jpg)` }} aria-hidden="true" />
      <div className="hero-contenu">
        <div className="hero-infos">
          <p className="surtitre">Bonjour {pseudo}</p>
          <h1 id="titre-boosters">Ouvre tes boosters</h1>

          {!etat && !erreur && <p className="aide">Chargement…</p>}
          {etat && (
            <>
              <div className="stock">
                <p className="stock-boosters">
                  <span className="stock-nombre">{actuel}</span>
                  <span className="stock-max">/ {max}</span>
                  <span className="stock-libelle">
                    booster{actuel > 1 ? "s" : ""} disponible{actuel > 1 ? "s" : ""}
                  </span>
                </p>
                <div className="jauge-stock" role="img" aria-label={`${actuel} boosters sur ${max}`}>
                  {Array.from({ length: max }, (_, i) => (
                    <span key={i} className={i < actuel ? "plein" : undefined} />
                  ))}
                </div>
                <p className="minuteur">
                  {actuel >= max ? (
                    "Stock plein : ouvre-en un pour relancer le minuteur."
                  ) : (
                    <>
                      Prochain booster dans <strong>{formaterDuree(restantMs)}</strong>
                    </>
                  )}
                </p>
              </div>

              <div className="choix-sets" role="radiogroup" aria-label="Set du booster">
                {etat.sets.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    role="radio"
                    aria-checked={s.code === set}
                    className={s.code === set ? "puce-set actif" : "puce-set"}
                    onClick={() => choisirSet(s.code)}
                  >
                    {s.nom}
                  </button>
                ))}
              </div>

              <button className="bouton-principal" onClick={() => setEnOuverture(true)} disabled={!peutOuvrir}>
                {actuel < 1 ? "Plus de booster pour l'instant" : `Ouvrir un booster ${nomSet}`}
              </button>
            </>
          )}
          {erreur && <p className="message-erreur">{erreur}</p>}
        </div>

        {etat && (
          <button
            type="button"
            className="hero-paquet"
            onClick={() => setEnOuverture(true)}
            disabled={!peutOuvrir}
            aria-label={`Ouvrir un booster ${nomSet}`}
          >
            <img
              key={`${visuel}-${illustration}`}
              src={`/ouverture/booster-${visuel}-${illustration}.webp`}
              alt=""
              width="621"
              height="1100"
            />
          </button>
        )}
      </div>

      {/* Rendu à la racine du document : le bandeau crée son propre empilement (isolation), qui laisserait
          la barre de navigation passer par-dessus l'ouverture et cacher ses boutons. */}
      {enOuverture &&
        set &&
        createPortal(
          <OuvertureBooster
            set={set}
            nomSet={nomSet}
            illustration={illustration}
            ouvrir={ouvrirSetChoisi}
            restants={actuel}
            surFermer={fermer}
          />,
          document.body,
        )}
    </section>
  );
}
