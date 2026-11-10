/**
 * Nouvelle annonce du marché, en fenêtre modale :
 * - « Qui a ? » (je cherche) : n'importe quelle carte du catalogue ;
 * - « Qui veut ? » (je propose) : une carte de ma collection (le serveur le revérifie).
 */
import { type FormEvent, useEffect, useState } from "react";
import { ImageCarte } from "./image-carte";
import { appelerApi } from "../outils/appels-api";
import { type Carte, type CartePossedee, classeRarete } from "../outils/libelles-cartes";
import { LIBELLES_ANNONCE, type TypeAnnonce } from "../outils/marche";

interface Props {
  surFermeture: () => void;
  surCreation: () => void;
}

type CarteChoix = Carte & Partial<Pick<CartePossedee, "quantite" | "quantiteFoil">>;

export function FormulaireAnnonce({ surFermeture, surCreation }: Props) {
  const [type, setType] = useState<TypeAnnonce>("cherche");
  const [recherche, setRecherche] = useState("");
  const [rechercheAppliquee, setRechercheAppliquee] = useState("");
  const [resultats, setResultats] = useState<CarteChoix[] | null>(null);
  const [choix, setChoix] = useState<CarteChoix | null>(null);
  const [foil, setFoil] = useState(false);
  const [note, setNote] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Recherche appliquée après une courte pause de frappe.
  useEffect(() => {
    const t = setTimeout(() => setRechercheAppliquee(recherche.trim()), 300);
    return () => clearTimeout(t);
  }, [recherche]);

  useEffect(() => {
    const source = type === "cherche" ? "/catalogue/cartes" : "/collection";
    const params = new URLSearchParams();
    if (rechercheAppliquee) params.set("recherche", rechercheAppliquee);
    let annule = false;
    appelerApi<{ cartes: CarteChoix[] }>("GET", `${source}?${params}`).then(
      (r) => !annule && setResultats(r.cartes.slice(0, 24)),
      (e: Error) => !annule && setErreur(e.message),
    );
    return () => {
      annule = true;
    };
  }, [type, rechercheAppliquee]);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === "Escape" && surFermeture();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [surFermeture]);

  function changerType(t: TypeAnnonce) {
    setType(t);
    setChoix(null);
    setFoil(false);
    setResultats(null);
  }

  function choisir(carte: CarteChoix) {
    setChoix(carte);
    // En « Je propose », foil seulement si j'en ai un (et foil d'office si je n'ai que des foils).
    if (type === "propose") setFoil((carte.quantite ?? 0) < 1 && (carte.quantiteFoil ?? 0) > 0);
    else setFoil(false);
  }

  const foilPossible = type === "cherche" || (choix?.quantiteFoil ?? 0) > 0;
  const normalePossible = type === "cherche" || (choix?.quantite ?? 0) > 0;

  async function publier(e: FormEvent) {
    e.preventDefault();
    if (!choix) return setErreur("Choisis une carte.");
    setEnvoi(true);
    setErreur(null);
    try {
      await appelerApi("POST", "/marche/annonces", { type, code: choix.code, foil, ...(note.trim() ? { note: note.trim() } : {}) });
      surCreation();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="fond-modale" onClick={surFermeture} role="presentation">
      <form className="modale modale-annonce formulaire" role="dialog" aria-modal="true" aria-label="Nouvelle annonce" onClick={(e) => e.stopPropagation()} onSubmit={publier}>
        <header className="entete">
          <h2>Nouvelle annonce</h2>
          <button type="button" className="bouton-icone" onClick={surFermeture} aria-label="Fermer">
            ×
          </button>
        </header>

        <div className="onglets onglets-pleins" role="radiogroup" aria-label="Type d'annonce">
          {(["cherche", "propose"] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={type === t} className={type === t ? "onglet actif" : "onglet"} onClick={() => changerType(t)}>
              {LIBELLES_ANNONCE[t].titre} <span className="aide">({LIBELLES_ANNONCE[t].court.toLowerCase()})</span>
            </button>
          ))}
        </div>

        <label>
          {type === "cherche" ? "Quelle carte cherches-tu ?" : "Quelle carte de ta collection proposes-tu ?"}
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="ex. Jinx, Fury, Spell…" autoFocus />
        </label>

        <div className="choix-cartes" role="listbox" aria-label="Cartes">
          {!resultats && <p className="aide">Chargement…</p>}
          {resultats?.length === 0 && (
            <p className="aide">{type === "propose" ? "Aucune carte de ta collection ne correspond." : "Aucune carte ne correspond."}</p>
          )}
          {resultats?.map((carte) => (
            <button
              key={carte.code}
              type="button"
              role="option"
              aria-selected={choix?.code === carte.code}
              className={`choix-carte ${classeRarete(carte)} ${choix?.code === carte.code ? "choisie" : ""}`}
              onClick={() => choisir(carte)}
              title={carte.nom}
            >
              <span className="cadre-carte">
                <ImageCarte image={carte.image} largeur={300} alt={carte.nom} className={carte.orientation === "paysage" ? "image-paysage" : undefined} paresseuse />
              </span>
              <small>{carte.nom}</small>
            </button>
          ))}
        </div>

        {choix && (
          <div className="recap-annonce">
            <p>
              <span className={`etiquette-annonce etiquette-${type}`}>{LIBELLES_ANNONCE[type].titre}</span> <strong>{choix.nom}</strong>
              {type === "propose" && (
                <span className="aide">
                  {" "}
                  · tu en as {choix.quantite ?? 0}
                  {(choix.quantiteFoil ?? 0) > 0 && ` + ${choix.quantiteFoil} foil`}
                </span>
              )}
            </p>
            <label className="bascule">
              <input type="checkbox" checked={foil} disabled={!foilPossible || !normalePossible} onChange={(e) => setFoil(e.target.checked)} /> Version foil
            </label>
            <label>
              Message <span className="aide">(optionnel, 140 caractères)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder={type === "cherche" ? "ex. pour finir mon deck Jinx" : "ex. contre une Épique"} />
            </label>
          </div>
        )}

        {erreur && <p className="message-erreur">{erreur}</p>}
        <button type="submit" disabled={!choix || envoi}>
          {envoi ? "Publication…" : "Publier l'annonce"}
        </button>
        <p className="aide">L'annonce reste sur le marché 30 jours ou jusqu'à ce que tu la retires. Elle est aussi publiée dans le salon.</p>
      </form>
    </div>
  );
}
