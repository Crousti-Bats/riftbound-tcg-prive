// Vite : lance le site + l'API en local (npm run dev) et les prépare pour la production (npm run build).
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const chemin = (relatif: string) => fileURLToPath(new URL(relatif, import.meta.url));

export default defineConfig({
  root: chemin("../application-web"),
  publicDir: chemin("../application-web/fichiers-statiques"),
  build: { outDir: chemin("../dist"), emptyOutDir: true },
  plugins: [react(), cloudflare({ configPath: chemin("./cloudflare-wrangler.jsonc") })],
});
