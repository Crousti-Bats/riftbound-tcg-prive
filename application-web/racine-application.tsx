/** Racine du site : charge le compte connecté et affiche la bonne page. */
import { useCallback, useEffect, useState } from "react";
import { type CompteCourant, chargerCompteCourant } from "./outils/appels-api";
import { naviguer, useCheminCourant } from "./outils/navigation";
import { PageAccueil } from "./pages/page-accueil";
import { PageAdmin } from "./pages/page-admin";
import { PageCatalogue } from "./pages/page-catalogue";
import { PageCollection } from "./pages/page-collection";
import { PageConnexion } from "./pages/page-connexion";
import { PageInscription } from "./pages/page-inscription";

export function RacineApplication() {
  const chemin = useCheminCourant();
  const [compte, setCompte] = useState<CompteCourant | null | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);

  const rafraichirCompte = useCallback(async () => {
    try {
      setCompte(await chargerCompteCourant());
    } catch {
      setErreur("Le serveur ne répond pas. Réessaie dans un instant.");
    }
  }, []);

  useEffect(() => {
    chargerCompteCourant().then(setCompte, () => setErreur("Le serveur ne répond pas. Réessaie dans un instant."));
  }, []);

  // Redirections : visiteur → connexion ; connecté → pas de page de connexion.
  useEffect(() => {
    if (compte === undefined) return;
    const pagesPubliques = ["/connexion", "/inscription"];
    if (!compte && !pagesPubliques.includes(chemin)) naviguer("/connexion");
    if (compte && pagesPubliques.includes(chemin)) naviguer("/");
    if (compte && chemin.startsWith("/admin") && compte.role !== "admin") naviguer("/");
  }, [compte, chemin]);

  if (erreur) return <main className="conteneur"><p className="message-erreur">{erreur}</p></main>;
  if (compte === undefined) return <main className="conteneur"><p>Chargement…</p></main>;

  if (!compte) {
    if (chemin === "/inscription") return <PageInscription surConnexion={rafraichirCompte} />;
    return <PageConnexion surConnexion={rafraichirCompte} />;
  }
  if (chemin === "/catalogue") return <PageCatalogue />;
  if (chemin === "/collection") return <PageCollection />;
  if (chemin.startsWith("/admin") && compte.role === "admin") {
    return <PageAdmin compte={compte} surChangementCompte={rafraichirCompte} />;
  }
  return <PageAccueil compte={compte} surDeconnexion={rafraichirCompte} />;
}
