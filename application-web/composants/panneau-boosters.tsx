/** Hub d'ouverture (bandeau principal de l'accueil) : stock de boosters, minuteur du prochain, choix du set, bouton Ouvrir, puis l'overlay de révélation. */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApercuBooster } from "./apercu-booster";
import { OuvertureBooster } from "./ouverture-booster";
import { appelerApi } from "../outils/appels-api";
import { type CarteOuverte, formaterDuree } from "../outils/libelles-cartes";
import { rechargerWishlist, useWishlist } from "../outils/wishlist";

interface Stock {
  actuel: number;
  max: number;
  prochainDansMs: number | null;
  /** Boosters offerts, en plus du stock normal (sans régénération ni plafond). */
  offerts?: number;
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
  // Relue par l'aperçu à chaque fermeture de l'ouverture (de nouvelles cartes ont pu être obtenues).
  const [versionCollection, setVersionCollection] = useState(0);
  const fermer = useCallback(() => {
    setEnOuverture(false);
    setVersionCollection((v) => v + 1);
  }, []);
  const rechargement = useRef(false);
  // ♥ N sur chaque booster : cartes de ma wishlist pas encore obtenues que ce booster peut donner.
  const [coeurs, setCoeurs] = useState<Record<string, number>>({});
  const wishlist = useWishlist();
  useEffect(() => {
    appelerApi<{ parSet: Record<string, number> }>("GET", "/boosters/wishlist").then((r) => setCoeurs(r.parSet), () => undefined);
  }, [wishlist, versionCollection]);

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
        // Les cartes obtenues ont quitté ma wishlist côté serveur : on met à jour les ♥.
        void rechargerWishlist().catch(() => undefined);
        return r.cartes;
      }),
    [set],
  );

  const stock = etat?.stock;
  const actuel = stock?.actuel ?? 0;
  const max = stock?.max ?? 10;
  const offerts = stock?.offerts ?? 0;
  const total = actuel + offerts;
  const visuel = set in ILLUSTRATIONS_PAR_SET ? set : "ogn";
  const illustration = illustrations[visuel] ?? 1;

  function choisirSet(code: string) {
    if (code === set) return;
    setSet(code);
    const cle = code in ILLUSTRATIONS_PAR_SET ? code : "ogn";
    setIllustrations({ ...illustrations, [cle]: autreIllustration(illustrations[cle] ?? 1, ILLUSTRATIONS_PAR_SET[cle] ?? 1) });
  }
  const nomSet = etat?.sets.find((s) => s.code === set)?.nom ?? set;
  // Carrousel « Changer de set » : chaque booster avec l'illustration affichée pour son set.
  const choixBoosters = (etat?.sets ?? []).map((s) => {
    const cle = s.code in ILLUSTRATIONS_PAR_SET ? s.code : "ogn";
    const numero = illustrations[cle] ?? 1;
    return { code: s.code, nom: s.nom, illustration: numero, image: `/ouverture/booster-${cle}-${numero}.webp`, coeurs: coeurs[s.code] ?? 0 };
  });

  /** À chaque ouverture du carrousel : une nouvelle illustration pour chaque set qui en a plusieurs. */
  function changerToutesLesIllustrations() {
    const suivantes: Record<string, number> = { ...illustrations };
    for (const [cle, nombre] of Object.entries(ILLUSTRATIONS_PAR_SET)) suivantes[cle] = autreIllustration(illustrations[cle] ?? 1, nombre);
    setIllustrations(suivantes);
  }
  const peutOuvrir = Boolean(set) && total >= 1;

  return (
    <>
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
                  {offerts > 0 && (
                    <p className="stock-offerts">
                      🎁 + <strong>{offerts}</strong> booster{offerts > 1 ? "s" : ""} offert{offerts > 1 ? "s" : ""}
                    </p>
                  )}
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
                      {(coeurs[s.code] ?? 0) > 0 && <CoeurWishlist nombre={coeurs[s.code] ?? 0} />}
                    </button>
                  ))}
                </div>

                <button className="bouton-principal" onClick={() => setEnOuverture(true)} disabled={!peutOuvrir}>
                  {total < 1 ? "Plus de booster pour l'instant" : `Ouvrir un booster ${nomSet}`}
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
              {(coeurs[set] ?? 0) > 0 && <CoeurWishlist nombre={coeurs[set] ?? 0} grand />}
            </button>
          )}
        </div>

        {/* Rendu à la racine du document : le bandeau crée son propre empilement (isolation), qui laisserait
            la barre de navigation passer par-dessus l'ouverture et cacher ses boutons. */}
        {enOuverture &&
          set &&
          createPortal(
            <OuvertureBooster
              key={set}
              set={set}
              nomSet={nomSet}
              illustration={illustration}
              ouvrir={ouvrirSetChoisi}
              restants={total}
              boosters={choixBoosters}
              surChangerSet={setSet}
              surOuvrirCarrousel={changerToutesLesIllustrations}
              surFermer={fermer}
            />,
            document.body,
          )}
      </section>
      {etat && set && <ApercuBooster set={set} nomSet={nomSet} version={versionCollection} />}
    </>
  );
}

/** ♥ N : nombre de cartes de ma wishlist (pas encore obtenues) que ce booster peut contenir. */
export function CoeurWishlist({ nombre, grand }: { nombre: number; grand?: boolean }) {
  const texte = `${nombre} carte${nombre > 1 ? "s" : ""} de ta wishlist dans ce booster`;
  return (
    <span className={grand ? "coeur-wishlist coeur-wishlist-grand" : "coeur-wishlist"} title={texte} aria-label={texte}>
      <span aria-hidden="true">♥</span> {nombre}
    </span>
  );
}
