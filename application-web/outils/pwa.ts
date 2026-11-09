/** PWA : enregistrement du service worker, installation de l'application, détection du mode hors ligne. */
import { useEffect, useState, useSyncExternalStore } from "react";

/** Événement non standard de Chrome, Edge et Android (absent des types DOM). */
interface EvenementInstallation extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let invitationInstallation: EvenementInstallation | null = null;
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());

/**
 * À appeler une seule fois, avant l'affichage de React : l'événement « beforeinstallprompt »
 * peut arriver très tôt et ne se répète pas.
 */
export function demarrerPwa(): void {
  window.addEventListener("beforeinstallprompt", (evenement) => {
    evenement.preventDefault(); // on affiche notre propre bouton au lieu de la bannière du navigateur
    invitationInstallation = evenement as EvenementInstallation;
    prevenir();
  });
  window.addEventListener("appinstalled", () => {
    invitationInstallation = null;
    prevenir();
  });

  // Pas de service worker en développement (npm run dev) : il garderait d'anciennes versions en cache.
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => undefined);
    });
  }
}

export function estApplicationInstallee(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone / iPad dans Safari : pas d'événement d'installation, il faut passer par le menu Partager. */
export function estIosSansInstallation(): boolean {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && !estApplicationInstallee();
}

/** Renvoie une fonction d'installation si le navigateur le propose, sinon null. */
export function useInstallation(): (() => Promise<void>) | null {
  const invitation = useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => invitationInstallation,
  );
  if (!invitation) return null;
  return async () => {
    await invitation.prompt();
    await invitation.userChoice.catch(() => undefined);
    invitationInstallation = null; // utilisable une seule fois
    prevenir();
  };
}

export function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine);
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
    };
  }, []);
  return enLigne;
}
