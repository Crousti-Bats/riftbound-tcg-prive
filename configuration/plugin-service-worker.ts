// Vite : fabrique dist/client/service-worker.js au build, à partir de application-web/service-worker/modele-service-worker.js.
// Il y injecte la liste des fichiers à précharger (JS et CSS du build, avec empreinte) et une version
// calculée sur cette liste : chaque déploiement qui change le site change la version, donc le cache.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/** Fichiers du dossier fichiers-statiques utiles hors ligne (les autres images ne sont pas préchargées). */
export const FICHIERS_STATIQUES_A_PRECHARGER = [
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icones/favicon-32.png",
  "/icones/icone-192.png",
];

/** Remplace les deux marqueurs du modèle. Fonction pure (testée dans serveur-api/tests/pwa.test.ts). */
export function construireServiceWorker(modele: string, fichiersDuBuild: string[]): string {
  const fichiers = ["/", ...FICHIERS_STATIQUES_A_PRECHARGER, ...[...fichiersDuBuild].sort()];
  const version = createHash("sha256").update(fichiers.join("\n")).digest("hex").slice(0, 12);
  const marqueurListe = '["__FICHIERS_A_PRECHARGER__"]';
  const marqueurVersion = '"__VERSION__"';
  if (!modele.includes(marqueurListe) || !modele.includes(marqueurVersion)) {
    throw new Error("Modèle de service worker invalide : marqueur introuvable.");
  }
  return modele.replace(marqueurListe, JSON.stringify(fichiers)).replace(marqueurVersion, JSON.stringify(version));
}

export function pluginServiceWorker(cheminModele: string): Plugin {
  return {
    name: "riftbound-service-worker",
    apply: "build",
    // Uniquement pour le site (pas pour le Worker de l'API, construit dans un autre environnement).
    applyToEnvironment: (environnement) => environnement.name === "client",
    generateBundle(_options, bundle) {
      const fichiersDuBuild = Object.values(bundle)
        .map((fichier) => fichier.fileName)
        .filter((nom) => nom.startsWith("assets/") && /\.(js|css)$/.test(nom))
        .map((nom) => `/${nom}`);
      this.emitFile({
        type: "asset",
        fileName: "service-worker.js",
        source: construireServiceWorker(readFileSync(cheminModele, "utf8"), fichiersDuBuild),
      });
    },
  };
}
