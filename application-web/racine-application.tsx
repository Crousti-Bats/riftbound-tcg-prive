/** Racine du site : charge le compte connecté et affiche la bonne page. */
import { useCallback, useEffect, useState } from "react";
import { BandeauAnnonce } from "./composants/bandeau-annonce";
import { BandeauHorsLigne } from "./composants/bandeau-hors-ligne";
import { BarreNavigation } from "./composants/barre-navigation";
import { type CompteCourant, chargerCompteCourant } from "./outils/appels-api";
import { naviguer, useCheminCourant } from "./outils/navigation";
import { PageAccueil } from "./pages/page-accueil";
import { PageAdmin } from "./pages/page-admin";
import { PageCatalogue } from "./pages/page-catalogue";
import { PageCollection } from "./pages/page-collection";
import { PageConnexion } from "./pages/page-connexion";
import { PageEchanges } from "./pages/page-echanges";
import { PageNouvelEchange } from "./pages/page-nouvel-echange";
import { PageInscription } from "./pages/page-inscription";
import { PageMarche } from "./pages/page-marche";
import { PageReinitialisation } from "./pages/page-reinitialisation";

export function RacineApplication() {
  const chemin = useCheminCourant();
  const [compte, setCompte] = useState<CompteCourant | null | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);

  const rafraichirCompte = useCallback(
    () =>
      chargerCompteCourant().then(
        (c) => {
          setCompte(c);
          setErreur(null);
        },
        (e: unknown) => setErreur(e instanceof Error ? e.message : "Le serveur ne répond pas. Réessaie dans un instant."),
      ),
    [],
  );

  useEffect(() => {
    chargerCompteCourant().then(setCompte, (e: unknown) =>
      setErreur(e instanceof Error ? e.message : "Le serveur ne répond pas. Réessaie dans un instant."),
    );
  }, []);

  // Application ouverte sans réseau ou serveur injoignable : on réessaie toute seule
  // dès que la connexion revient, puis toutes les 15 secondes tant que l'erreur dure.
  useEffect(() => {
    if (!erreur) return;
    const reessayer = () => void rafraichirCompte();
    const minuteur = window.setInterval(() => {
      if (navigator.onLine) reessayer();
    }, 15_000);
    window.addEventListener("online", reessayer);
    return () => {
      window.clearInterval(minuteur);
      window.removeEventListener("online", reessayer);
    };
  }, [erreur, rafraichirCompte]);

  // Redirections : visiteur → connexion ; connecté → pas de page de connexion.
  useEffect(() => {
    if (compte === undefined) return;
    const pagesPubliques = ["/connexion", "/inscription", "/reinitialisation"];
    if (!compte && !pagesPubliques.includes(chemin)) naviguer("/connexion");
    // La page de nouveau mot de passe reste accessible même connecté (lien reçu de l'admin).
    if (compte && pagesPubliques.includes(chemin) && chemin !== "/reinitialisation") naviguer("/");
    if (compte && chemin.startsWith("/admin") && compte.role !== "admin") naviguer("/");
  }, [compte, chemin]);

  return (
    <>
      <BandeauHorsLigne />
      {erreur ? (
        <main className="conteneur">
          <div className="carte pile conteneur-etroit">
            <p className="message-erreur">{erreur}</p>
            <button onClick={() => void rafraichirCompte()}>Réessayer</button>
          </div>
        </main>
      ) : (
        <>
          {compte && chemin !== "/reinitialisation" && <BarreNavigation compte={compte} chemin={chemin} surDeconnexion={rafraichirCompte} />}
          {compte && chemin !== "/reinitialisation" && <BandeauAnnonce />}
          <Page compte={compte} chemin={chemin} rafraichirCompte={rafraichirCompte} />
        </>
      )}
    </>
  );
}

function Page({
  compte,
  chemin,
  rafraichirCompte,
}: {
  compte: CompteCourant | null | undefined;
  chemin: string;
  rafraichirCompte: () => Promise<void>;
}) {
  if (compte === undefined) return <main className="conteneur"><p>Chargement…</p></main>;
  if (chemin === "/reinitialisation") return <PageReinitialisation />;

  if (!compte) {
    if (chemin === "/inscription") return <PageInscription surConnexion={rafraichirCompte} />;
    return <PageConnexion surConnexion={rafraichirCompte} />;
  }
  if (chemin === "/catalogue") return <PageCatalogue />;
  if (chemin === "/collection") return <PageCollection />;
  if (chemin === "/echanges") return <PageEchanges />;
  if (chemin === "/echanges/nouveau") return <PageNouvelEchange />;
  if (chemin === "/marche" || chemin.startsWith("/marche/")) return <PageMarche chemin={chemin} />;
  if (chemin.startsWith("/admin") && compte.role === "admin") {
    return <PageAdmin compte={compte} surChangementCompte={rafraichirCompte} />;
  }
  return <PageAccueil compte={compte} />;
}
