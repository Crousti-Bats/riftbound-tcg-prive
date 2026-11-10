/** Navigation entre les pages sans recharger le site (History API). */
import { useEffect, useState } from "react";

const EVENEMENT = "navigation";

export function naviguer(chemin: string, options: { remplacer?: boolean } = {}): void {
  if (chemin === window.location.pathname) return;
  if (options.remplacer) window.history.replaceState(null, "", chemin);
  else window.history.pushState(null, "", chemin);
  window.dispatchEvent(new Event(EVENEMENT));
}

export function useCheminCourant(): string {
  const [chemin, setChemin] = useState(window.location.pathname);
  useEffect(() => {
    const maj = () => setChemin(window.location.pathname);
    window.addEventListener("popstate", maj);
    window.addEventListener(EVENEMENT, maj);
    return () => {
      window.removeEventListener("popstate", maj);
      window.removeEventListener(EVENEMENT, maj);
    };
  }, []);
  return chemin;
}

export function formaterDate(horodatage: number | null | undefined): string {
  if (!horodatage) return "—";
  return new Date(horodatage).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}
