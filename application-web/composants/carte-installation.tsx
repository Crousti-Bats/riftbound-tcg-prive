/**
 * Proposition d'installer le site comme une application (PC, Android, iPhone).
 * Invisible si l'application est déjà installée ou si le joueur a masqué la proposition.
 */
import { useState } from "react";
import { estApplicationInstallee, estIosSansInstallation, useInstallation } from "../outils/pwa";

const CLE_MASQUEE = "installation-masquee";

function lireMasquee(): boolean {
  try {
    return localStorage.getItem(CLE_MASQUEE) === "1";
  } catch {
    return false;
  }
}

export function CarteInstallation() {
  const installer = useInstallation();
  const [masquee, setMasquee] = useState(lireMasquee);
  const ios = estIosSansInstallation();

  if (masquee || estApplicationInstallee() || (!installer && !ios)) return null;

  function masquer() {
    try {
      localStorage.setItem(CLE_MASQUEE, "1");
    } catch {
      // stockage indisponible (navigation privée) : on masque seulement pour cette visite
    }
    setMasquee(true);
  }

  return (
    <section className="carte carte-installation">
      <div>
        <h2>Installer l'application</h2>
        {installer ? (
          <p className="aide">Ouvre le site comme une vraie application, depuis le bureau ou l'écran d'accueil.</p>
        ) : (
          <p className="aide">
            Sur iPhone ou iPad : touche le bouton <strong>Partager</strong> de Safari, puis{" "}
            <strong>« Sur l'écran d'accueil »</strong>.
          </p>
        )}
      </div>
      <div className="barre-actions">
        {installer && <button onClick={() => void installer()}>Installer</button>}
        <button className="secondaire" onClick={masquer}>
          Plus tard
        </button>
      </div>
    </section>
  );
}
