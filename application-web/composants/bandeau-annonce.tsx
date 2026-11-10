/**
 * Grand bandeau d'annonce publié par l'admin, sous la barre de navigation, pour tous les joueurs connectés.
 * Relu à l'ouverture, au retour sur l'application et toutes les 2 minutes. Chaque joueur peut le fermer :
 * il réapparaît dès qu'une nouvelle annonce est publiée.
 */
import { useCallback, useEffect, useState } from "react";
import { appelerApi } from "../outils/appels-api";

interface Annonce {
  id: number;
  texte: string;
  creeLe: number;
}

const CLE_FERMEE = "annonce-fermee";

function idFermee(): number {
  try {
    return Number(localStorage.getItem(CLE_FERMEE) ?? 0);
  } catch {
    return 0;
  }
}

export function BandeauAnnonce() {
  const [annonce, setAnnonce] = useState<Annonce | null>(null);
  const [fermee, setFermee] = useState(idFermee);

  const charger = useCallback(() => {
    appelerApi<{ annonce: Annonce | null }>("GET", "/annonce-site").then(
      (r) => setAnnonce(r.annonce),
      () => undefined, // hors ligne : on garde l'annonce déjà affichée
    );
  }, []);

  useEffect(() => {
    charger();
    const minuteur = window.setInterval(() => {
      if (document.visibilityState === "visible") charger();
    }, 120_000);
    const auRetour = () => document.visibilityState === "visible" && charger();
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      window.clearInterval(minuteur);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, [charger]);

  if (!annonce || annonce.id === fermee) return null;

  function fermer() {
    if (!annonce) return;
    try {
      localStorage.setItem(CLE_FERMEE, String(annonce.id));
    } catch {
      // stockage indisponible : fermé seulement pour cette visite
    }
    setFermee(annonce.id);
  }

  return (
    <aside className="bandeau-annonce" role="status" aria-label="Annonce">
      <span className="bandeau-annonce-icone" aria-hidden="true">📣</span>
      <p className="bandeau-annonce-texte">{annonce.texte}</p>
      <button className="bandeau-annonce-fermer" onClick={fermer} aria-label="Fermer l'annonce" title="Fermer">
        ✕
      </button>
    </aside>
  );
}
