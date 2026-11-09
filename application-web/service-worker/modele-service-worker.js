/*
  Service worker du site (PWA) : permet d'installer l'application et de l'ouvrir sans réseau.

  CE FICHIER EST UN MODÈLE. Au build, configuration/plugin-service-worker.ts le copie vers
  dist/client/service-worker.js en remplaçant la version et la liste des fichiers à précharger.

  Règles (documentation/etat-du-projet.md, étape 9) :
  - /api/* n'est JAMAIS mis en cache : aucune donnée de compte (collection, échanges, session) ne reste
    sur l'appareil, et le serveur reste seul juge (stock de boosters, possession des cartes).
  - Pages : réseau d'abord ; sans réseau, on sert la coquille de l'application (index.html), qui affiche
    « hors ligne » et se reconnecte toute seule.
  - /assets/* (noms avec empreinte, donc immuables) : cache d'abord.
  - Autres fichiers du site (icônes, manifeste) : réseau d'abord, cache en secours.
  - Images des cartes (CDN Riot, autre origine) : non interceptées, le cache HTTP du navigateur suffit.
*/
const VERSION = "__VERSION__";
const FICHIERS_A_PRECHARGER = ["__FICHIERS_A_PRECHARGER__"];

const PREFIXE_CACHE = "riftbound-";
const CACHE = PREFIXE_CACHE + VERSION;
const COQUILLE = "/";

self.addEventListener("install", (evenement) => {
  evenement.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FICHIERS_A_PRECHARGER))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((noms) =>
        Promise.all(noms.filter((nom) => nom.startsWith(PREFIXE_CACHE) && nom !== CACHE).map((nom) => caches.delete(nom))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (requete.mode === "navigate") evenement.respondWith(page(requete));
  else if (url.pathname.startsWith("/assets/")) evenement.respondWith(cacheDAbord(requete));
  else evenement.respondWith(reseauDAbord(requete));
});

/** Réponse saine à garder : 200 de notre origine (pas de redirection, pas d'erreur). */
function aGarder(reponse) {
  return reponse.ok && reponse.type === "basic" && !reponse.redirected;
}

async function page(requete) {
  const cache = await caches.open(CACHE);
  try {
    const reponse = await fetch(requete);
    // Toutes les pages renvoient index.html (application à page unique) : on rafraîchit la coquille.
    if (aGarder(reponse)) await cache.put(COQUILLE, reponse.clone());
    return reponse;
  } catch {
    return (await cache.match(COQUILLE)) ?? horsLigne();
  }
}

async function cacheDAbord(requete) {
  const cache = await caches.open(CACHE);
  const enCache = await cache.match(requete);
  if (enCache) return enCache;
  try {
    const reponse = await fetch(requete);
    if (aGarder(reponse)) await cache.put(requete, reponse.clone());
    return reponse;
  } catch {
    return horsLigne();
  }
}

async function reseauDAbord(requete) {
  const cache = await caches.open(CACHE);
  try {
    const reponse = await fetch(requete);
    if (aGarder(reponse)) await cache.put(requete, reponse.clone());
    return reponse;
  } catch {
    return (await cache.match(requete)) ?? horsLigne();
  }
}

function horsLigne() {
  return new Response("Hors ligne", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
