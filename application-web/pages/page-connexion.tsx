import { type FormEvent, useState } from "react";
import { appelerApi } from "../outils/appels-api";
import { naviguer } from "../outils/navigation";

export function PageConnexion({ surConnexion }: { surConnexion: () => Promise<void> }) {
  const [pseudo, setPseudo] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await appelerApi("POST", "/auth/connexion", { pseudo, motDePasse });
      await surConnexion();
      naviguer("/");
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <main className="conteneur conteneur-etroit page-publique">
      <h1 className="titre-connexion">
        <img src="/icones/logo-transparent-512.png" alt="" width="84" height="84" />
        Riftbound TCG
      </h1>
      <form className="carte formulaire" onSubmit={envoyer}>
        <h2>Connexion</h2>
        <label>
          Pseudo
          <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} autoComplete="username" required maxLength={20} />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        {erreur && <p className="message-erreur">{erreur}</p>}
        <button type="submit" disabled={envoi}>{envoi ? "Connexion…" : "Se connecter"}</button>
        <p className="aide">
          Pas de compte ? <a href="/inscription" onClick={(e) => { e.preventDefault(); naviguer("/inscription"); }}>J'ai un code d'invitation</a>
        </p>
      </form>
    </main>
  );
}
