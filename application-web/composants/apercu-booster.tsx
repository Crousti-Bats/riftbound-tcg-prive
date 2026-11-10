/**
 * Aperçu du booster choisi, avant de l'ouvrir : deux onglets.
 * - « Les plus rares » : les catégories Rare+ de ce set avec leur chance par booster, et les cartes de chacune ;
 * - « Il te manque » : les cartes de ce booster que je n'ai pas encore, les plus rares d'abord.
 * Les cartes de ma wishlist portent un ♥.
 */
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { FicheCarte } from "./fiche-carte";
import { ImageCarte } from "./image-carte";
import { appelerApi } from "../outils/appels-api";
import { type CartePossedee, classeRarete } from "../outils/libelles-cartes";
import { type CategorieRevelation, categorieRevelation, REVELATION } from "../outils/ouverture-revelation";
import { useWishlist } from "../outils/wishlist";

type CategorieRare = "ultime" | "special" | "signee" | "overnumbered" | "alt" | "epic";
interface Apercu {
  plusRares: Array<{ categorie: CategorieRare; unBoosterSur: number; cartes: CartePossedee[] }>;
  manquantes: { total: number; possedees: number; nombre: number; page: number; parPage: number; cartes: CartePossedee[] };
}

const REVELATION_DE: Record<CategorieRare, CategorieRevelation> = {
  ultime: "ultime",
  special: "special",
  signee: "signee",
  overnumbered: "over",
  alt: "alt",
  epic: "epic",
};

const formaterChance = (n: number) => `1 booster sur ${n.toLocaleString("fr-FR")}`;

interface Props {
  set: string;
  nomSet: string;
  /** Change après chaque ouverture : l'aperçu est relu (de nouvelles cartes ont pu être obtenues). */
  version: number;
}

export function ApercuBooster({ set, nomSet, version }: Props) {
  const [onglet, setOnglet] = useState<"rares" | "manque">("rares");
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [suite, setSuite] = useState<CartePossedee[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fiche, setFiche] = useState<CartePossedee | null>(null);
  const wishlist = useWishlist();

  useEffect(() => {
    let actif = true;
    appelerApi<Apercu>("GET", `/boosters/apercu?set=${encodeURIComponent(set)}`).then(
      (a) => {
        if (!actif) return;
        setApercu(a);
        setSuite([]);
        setErreur(null);
      },
      (e: Error) => {
        if (actif) setErreur(e.message);
      },
    );
    return () => {
      actif = false;
    };
  }, [set, version]);

  const voirPlus = useCallback(() => {
    if (!apercu) return;
    const page = apercu.manquantes.page + 1 + Math.floor(suite.length / apercu.manquantes.parPage);
    appelerApi<Apercu>("GET", `/boosters/apercu?set=${encodeURIComponent(set)}&page=${page}`).then(
      (a) => setSuite((s) => [...s, ...a.manquantes.cartes]),
      (e: Error) => setErreur(e.message),
    );
  }, [apercu, set, suite.length]);

  const manquantes = apercu ? [...apercu.manquantes.cartes, ...suite] : [];
  const m = apercu?.manquantes;

  return (
    <section className="carte apercu-booster" aria-label={`Contenu d'un booster ${nomSet}`}>
      <div className="apercu-entete">
        <h2>Dans un booster {nomSet}</h2>
        <div className="onglets" role="tablist">
          <button role="tab" aria-selected={onglet === "rares"} className={onglet === "rares" ? "onglet actif" : "onglet"} onClick={() => setOnglet("rares")}>
            Les plus rares
          </button>
          <button role="tab" aria-selected={onglet === "manque"} className={onglet === "manque" ? "onglet actif" : "onglet"} onClick={() => setOnglet("manque")}>
            Il te manque{m ? ` (${m.nombre})` : ""}
          </button>
        </div>
      </div>

      {erreur && <p className="message-erreur">{erreur}</p>}
      {!apercu && !erreur && <p className="aide">Chargement…</p>}

      {apercu && onglet === "rares" && (
        <div className="apercu-groupes">
          {apercu.plusRares.map((g) => {
            const info = REVELATION[REVELATION_DE[g.categorie]];
            const possedees = g.cartes.filter((c) => c.quantite + c.quantiteFoil > 0).length;
            return (
              <div key={g.categorie} className="apercu-groupe" style={{ "--c": info.couleur } as CSSProperties}>
                <p className="apercu-groupe-titre">
                  <strong>{info.nom}</strong>
                  <span>{formaterChance(g.unBoosterSur)}</span>
                  <span className="aide">
                    {possedees}/{g.cartes.length} obtenue{possedees > 1 ? "s" : ""}
                  </span>
                </p>
                <div className="apercu-rangee">
                  {g.cartes.map((carte) => (
                    <Vignette key={carte.code} carte={carte} enWishlist={wishlist.has(carte.code)} surClic={() => setFiche(carte)} />
                  ))}
                </div>
              </div>
            );
          })}
          <p className="aide">
            Chances pour un booster de 14 cartes (2 emplacements Rare ou mieux, plus l'emplacement Foil pour les Epic). Le tirage est fait par
            le serveur.
          </p>
        </div>
      )}

      {apercu && m && onglet === "manque" && (
        <>
          <div className="completion-set apercu-progression">
            <span className="aide">
              Tu as {m.possedees} des {m.total} cartes de ce booster
            </span>
            <span className="barre-completion">
              <span className="barre-completion-remplie" style={{ width: `${m.total ? (m.possedees / m.total) * 100 : 0}%` }} />
            </span>
          </div>
          {m.nombre === 0 ? (
            <p className="aide">Bravo, tu as toutes les cartes de ce booster !</p>
          ) : (
            <div className="grille-cartes grille-compacte">
              {manquantes.map((carte) => (
                <Vignette key={carte.code} carte={carte} enWishlist={wishlist.has(carte.code)} surClic={() => setFiche(carte)} legende />
              ))}
            </div>
          )}
          {manquantes.length < m.nombre && (
            <button className="secondaire apercu-plus" onClick={voirPlus}>
              Voir plus ({m.nombre - manquantes.length} restantes)
            </button>
          )}
        </>
      )}

      {fiche && (
        <FicheCarte
          carte={fiche}
          nomSet={nomSet}
          possession={{ quantite: fiche.quantite, quantiteFoil: fiche.quantiteFoil }}
          surFermeture={() => setFiche(null)}
        />
      )}
    </section>
  );
}

function Vignette({ carte, enWishlist, surClic, legende }: { carte: CartePossedee; enWishlist: boolean; surClic: () => void; legende?: boolean }) {
  const total = carte.quantite + carte.quantiteFoil;
  const info = REVELATION[categorieRevelation(carte)];
  return (
    <button className={`vignette-carte ${classeRarete(carte)} ${total === 0 ? "apercu-non-obtenue" : ""}`} onClick={surClic} title={carte.nom}>
      <span className={`cadre-carte ${carte.quantiteFoil > 0 ? "voile-foil" : ""}`}>
        <ImageCarte className={carte.orientation === "paysage" ? "image-paysage" : undefined} image={carte.image} largeur={300} alt={carte.nom} paresseuse />
        {total > 0 && <span className="badge-quantite">×{total}</span>}
        {enWishlist && (
          <span className="badge-wishlist" aria-label="Dans ma wishlist">
            ♥
          </span>
        )}
      </span>
      {legende && (
        <span className="legende-carte">
          {carte.nom}
          <small>{info.nom}</small>
        </span>
      )}
    </button>
  );
}
