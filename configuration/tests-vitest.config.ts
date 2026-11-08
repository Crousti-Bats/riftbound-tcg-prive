// Vitest : où trouver les tests automatiques (fichiers *.test.ts).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: fileURLToPath(new URL("..", import.meta.url)),
    include: ["serveur-api/**/*.test.ts", "application-web/**/*.test.ts"],
    environment: "node",
  },
});
