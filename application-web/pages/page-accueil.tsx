import { useEffect, useState } from "react";
import { PanneauBoosters } from "../composants/panneau-boosters";
import { appelerApi, type CompteCourant } from "../outils/appels-api";
import { naviguer } from "../outils/navigation";

export function PageAccueil({ compte, surDeconnexion }: { compte: CompteCourant; surDeconnexion: () => Promise<void> }) {
  const [recuesEnAttente, setRecuesEnAttente] = useState(0);

  useEffect(() => {
    appelerApi<{ recuesEnAttente: number }>("GET", "/echanges/resume").then(
      (r) => setRecuesEnAttente(r.recuesEnAttente),
      () => undefined, // la pastille est un bonus : pas d'erreur affichée si elle échoue
    );
  }, []);

  async function seDeconnecter() {
    await appelerApi("POST", "/auth/deconnexion", {}).catch(() => undefined);
    await surDeconnexion();
    naviguer("/connexion");
  }

  return (
    <main className="conteneur">
      <header className="entete">
        <h1>Riftbound TCG</h1>
        <nav className="barre-actions">
          {compte.role === "admin" && (
            <button className="secondaire" onClick={() => naviguer("/admin")}>
              Administration
            </button>
          )}
          <button className="secondaire" onClick={seDeconnecter}>
            Se déconnecter
          </button>
        </nav>
      </header>

      <div className="pile">
        <section className="carte">
          <h2>Bonjour {compte.pseudo} 👋</h2>
          <nav className="barre-actions">
            <button onClick={() => naviguer("/collection")}>Ma collection</button>
            <button className="secondaire bouton-pastille" onClick={() => naviguer("/echanges")}>
              Échanges
              {recuesEnAttente > 0 && (
                <span className="pastille" aria-label={`${recuesEnAttente} proposition(s) reçue(s)`}>
                  {recuesEnAttente}
                </span>
              )}
            </button>
            <button className="secondaire" onClick={() => naviguer("/catalogue")}>
              Voir toutes les cartes
            </button>
          </nav>
        </section>

        <PanneauBoosters />
      </div>
    </main>
  );
}
