import { type FormEvent, useState } from "react";
import { appelerApi } from "../outils/appels-api";
import { naviguer } from "../outils/navigation";

/** Lien de la forme /reinitialisation#code=XXXX (créé par l'admin) : le # n'est jamais envoyé au serveur ni dans les journaux. */
function codeDepuisLien(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get("code") ?? "";
}

export function PageReinitialisation() {
  const [code] = useState(codeDepuisLien);
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [pseudo, setPseudo] = useState<string | null>(null);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await appelerApi<{ pseudo: string }>("POST", "/auth/reinitialisation", { code, motDePasse });
      window.history.replaceState(null, "", "/reinitialisation"); // efface le code de l'adresse
      setPseudo(r.pseudo);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  // Après un changement, les sessions sont fermées côté serveur : on recharge pour repartir d'un état propre.
  const allerConnexion = () => (pseudo ? window.location.assign("/connexion") : naviguer("/connexion"));

  return (
    <main className="conteneur conteneur-etroit page-publique">
      <h1 className="titre-connexion">
        <img src="/icones/logo-transparent-512.png" alt="" width="84" height="84" />
        Riftbound TCG
      </h1>
      {pseudo ? (
        <section className="carte formulaire">
          <h2>Mot de passe changé</h2>
          <p>
            Tu peux te connecter avec le pseudo <strong>{pseudo}</strong> et ton nouveau mot de passe.
          </p>
          <button onClick={allerConnexion}>Se connecter</button>
        </section>
      ) : !code ? (
        <section className="carte formulaire">
          <h2>Lien incomplet</h2>
          <p className="aide">Ce lien ne contient pas de code. Demande un nouveau lien à l'administrateur.</p>
          <button className="secondaire" onClick={allerConnexion}>Retour à la connexion</button>
        </section>
      ) : (
        <form className="carte formulaire" onSubmit={envoyer}>
          <h2>Nouveau mot de passe</h2>
          <label>
            Nouveau mot de passe
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
              maxLength={128}
            />
            <span className="aide">6 caractères minimum.</span>
          </label>
          <label>
            Confirmer
            <input
              type="password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
              maxLength={128}
            />
          </label>
          {erreur && <p className="message-erreur">{erreur}</p>}
          <button type="submit" disabled={envoi}>{envoi ? "Enregistrement…" : "Changer mon mot de passe"}</button>
        </form>
      )}
    </main>
  );
}
