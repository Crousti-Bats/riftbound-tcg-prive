/** Bandeau affiché en haut de l'écran quand l'appareil n'a plus de connexion. */
import { useEnLigne } from "../outils/pwa";

export function BandeauHorsLigne() {
  const enLigne = useEnLigne();
  if (enLigne) return null;
  return (
    <div className="bandeau-hors-ligne" role="status">
      Hors ligne : les boosters, la collection et les échanges reviendront dès que la connexion sera rétablie.
    </div>
  );
}
