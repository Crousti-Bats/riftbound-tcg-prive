/** Carte de l'accueil : activer les notifications « boosters pleins » sur cet appareil. */
import { useEffect, useState } from "react";
import {
  activerNotifications,
  desactiverNotifications,
  type EtatNotifications,
  lireEtatNotifications,
  testerNotifications,
} from "../outils/notifications";

export function CarteNotifications() {
  const [etat, setEtat] = useState<EtatNotifications | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    lireEtatNotifications().then(setEtat, () => setEtat("non_disponible"));
  }, []);

  if (etat === null || etat === "non_disponible") return null;

  async function agir(action: () => Promise<void>) {
    setOccupe(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Impossible pour le moment, réessaie.");
    } finally {
      setOccupe(false);
    }
  }

  return (
    <section className="carte carte-installation carte-notifications">
      <div>
        <h2>Notifications</h2>
        {etat === "installer_d_abord" && (
          <p className="aide">
            Sur iPhone, installe d'abord l'application (Safari → Partager → « Sur l'écran d'accueil »), puis ouvre-la depuis
            l'écran d'accueil pour activer les notifications.
          </p>
        )}
        {etat === "refusees" && (
          <p className="aide">Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur ou du téléphone.</p>
        )}
        {etat === "desactivees" && <p className="aide">Sois prévenu sur cet appareil quand tes boosters sont pleins.</p>}
        {etat === "activees" && <p className="aide">Activées sur cet appareil : tu seras prévenu quand tes boosters seront pleins.</p>}
        {message && <p className="aide">{message}</p>}
      </div>
      {etat === "desactivees" && (
        <button disabled={occupe} onClick={() => void agir(async () => setEtat(await activerNotifications()))}>
          Activer
        </button>
      )}
      {etat === "activees" && (
        <div className="barre-actions">
          <button
            className="secondaire"
            disabled={occupe}
            onClick={() =>
              void agir(async () => {
                const envoyes = await testerNotifications();
                setMessage(envoyes ? "Notification d'essai envoyée." : "L'envoi a échoué. Désactive puis réactive les notifications.");
              })
            }
          >
            Tester
          </button>
          <button className="secondaire" disabled={occupe} onClick={() => void agir(async () => setEtat(await desactiverNotifications()))}>
            Désactiver
          </button>
        </div>
      )}
    </section>
  );
}
