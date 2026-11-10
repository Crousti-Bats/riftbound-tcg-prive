/**
 * Notifications push « boosters pleins » côté navigateur : abonnement, désabonnement, essai.
 * Le navigateur crée l'abonnement avec la clé publique VAPID du serveur, puis on l'enregistre côté serveur.
 * Sur iPhone, les notifications ne marchent que dans l'application installée (écran d'accueil, iOS 16.4 ou plus).
 */
import { appelerApi } from "./appels-api";
import { estIosSansInstallation } from "./pwa";

export type EtatNotifications =
  /** Navigateur sans notifications push (ou site en développement, sans service worker). */
  | "non_disponible"
  /** iPhone/iPad : il faut d'abord installer l'application sur l'écran d'accueil. */
  | "installer_d_abord"
  /** Le joueur a refusé : seuls les réglages du navigateur peuvent les réactiver. */
  | "refusees"
  | "desactivees"
  | "activees";

function pushDisponible(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function abonnementActuel(): Promise<PushSubscription | null> {
  const enregistrement = await navigator.serviceWorker.getRegistration("/");
  return (await enregistrement?.pushManager.getSubscription()) ?? null;
}

export async function lireEtatNotifications(): Promise<EtatNotifications> {
  if (!pushDisponible()) return estIosSansInstallation() ? "installer_d_abord" : "non_disponible";
  if (!(await navigator.serviceWorker.getRegistration("/"))) return "non_disponible";
  if (Notification.permission === "denied") return "refusees";
  return Notification.permission === "granted" && (await abonnementActuel()) ? "activees" : "desactivees";
}

function versOctets(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((base64url.length + 3) % 4);
  const binaire = atob(b64);
  const octets = new Uint8Array(new ArrayBuffer(binaire.length));
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

/** À appeler depuis un clic (les navigateurs l'exigent pour demander l'autorisation). */
export async function activerNotifications(): Promise<EtatNotifications> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "refusees" : "desactivees";

  const { clePublique } = await appelerApi<{ clePublique: string }>("GET", "/notifications/cle-publique");
  const enregistrement = await navigator.serviceWorker.ready;
  let abonnement = await enregistrement.pushManager.getSubscription();
  // Ancien abonnement créé avec une autre clé serveur : on le remplace.
  const cleActuelle = abonnement?.options.applicationServerKey;
  if (abonnement && cleActuelle && btoa(String.fromCharCode(...new Uint8Array(cleActuelle))) !== btoa(String.fromCharCode(...versOctets(clePublique)))) {
    await abonnement.unsubscribe();
    abonnement = null;
  }
  abonnement ??= await enregistrement.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versOctets(clePublique) });

  const json = abonnement.toJSON();
  await appelerApi("POST", "/notifications/abonnement", {
    endpoint: abonnement.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
  });
  return "activees";
}

export async function desactiverNotifications(): Promise<EtatNotifications> {
  const abonnement = await abonnementActuel();
  if (abonnement) {
    await appelerApi("POST", "/notifications/desabonnement", { endpoint: abonnement.endpoint }).catch(() => undefined);
    await abonnement.unsubscribe();
  }
  return "desactivees";
}

export async function testerNotifications(): Promise<number> {
  const r = await appelerApi<{ envoyes: number }>("POST", "/notifications/test", {});
  return r.envoyes;
}
