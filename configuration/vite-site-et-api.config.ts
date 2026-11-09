// Vite : lance le site + l'API en local (npm run dev) et les prépare pour la production (npm run build).
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { pluginServiceWorker } from "./plugin-service-worker.ts";

const chemin = (relatif: string) => fileURLToPath(new URL(relatif, import.meta.url));

export default defineConfig({
  root: chemin("../application-web"),
  publicDir: chemin("../application-web/fichiers-statiques"),
  build: { outDir: chemin("../dist"), emptyOutDir: true },
  plugins: [
    react(),
    // PWA : service worker généré au build (aucune dépendance externe, voir le fichier du plugin).
    pluginServiceWorker(chemin("../application-web/service-worker/modele-service-worker.js")),
    cloudflare({
      configPath: chemin("./cloudflare-wrangler.jsonc"),
      // Base locale partagée avec `npm run base:migrer-local` et `npm run admin:invitation -- --local`.
      persistState: { path: chemin("../.wrangler/state") },
    }),
  ],
});
