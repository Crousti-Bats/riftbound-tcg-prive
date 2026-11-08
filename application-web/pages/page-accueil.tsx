import { appelerApi, type CompteCourant } from "../outils/appels-api";
import { naviguer } from "../outils/navigation";

export function PageAccueil({ compte, surDeconnexion }: { compte: CompteCourant; surDeconnexion: () => Promise<void> }) {
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
          {compte.role === "admin" && <button className="secondaire" onClick={() => naviguer("/admin")}>Administration</button>}
          <button className="secondaire" onClick={seDeconnecter}>Se déconnecter</button>
        </nav>
      </header>
      <section className="carte">
        <h2>Bonjour {compte.pseudo} 👋</h2>
        <p>Ton compte est prêt. L'ouverture des boosters et ta collection arrivent dans les prochaines étapes.</p>
      </section>
    </main>
  );
}
