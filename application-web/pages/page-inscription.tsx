import { type FormEvent, useState } from "react";
import { appelerApi } from "../outils/appels-api";
import { naviguer } from "../outils/navigation";

/** Le lien d'invitation est de la forme /inscription#code=XXXX : le # n'est jamais envoyé au serveur ni dans les journaux. */
function codeDepuisLien(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get("code") ?? "";
}

export function PageInscription({ surConnexion }: { surConnexion: () => Promise<void> }) {
  const [code, setCode] = useState(codeDepuisLien);
  const [pseudo, setPseudo] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      await appelerApi("POST", "/auth/inscription", { code, pseudo, motDePasse });
      window.history.replaceState(null, "", "/"); // efface le code de l'adresse
      await surConnexion();
      naviguer("/");
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <main className="conteneur conteneur-etroit">
      <h1>Riftbound TCG</h1>
      <form className="carte formulaire" onSubmit={envoyer}>
        <h2>Créer mon compte</h2>
        <label>
          Code d'invitation
          <input value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="off" />
        </label>
        <label>
          Pseudo <span className="aide">(3 à 20 caractères : lettres, chiffres, _ ou -)</span>
          <input
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            pattern="[A-Za-z0-9_\-]{3,20}"
            autoComplete="username"
            required
          />
        </label>
        <label>
          Mot de passe <span className="aide">(6 caractères minimum)</span>
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            minLength={6}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Confirmer le mot de passe
          <input
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            minLength={6}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        {erreur && <p className="message-erreur">{erreur}</p>}
        <button type="submit" disabled={envoi}>{envoi ? "Création…" : "Créer mon compte"}</button>
        <p className="aide">
          Déjà inscrit ? <a href="/connexion" onClick={(e) => { e.preventDefault(); naviguer("/connexion"); }}>Se connecter</a>
        </p>
      </form>
    </main>
  );
}
