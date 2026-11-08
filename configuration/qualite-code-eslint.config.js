// ESLint : règles de qualité et de sécurité du code.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", ".wrangler/**", "node_modules/**", "serveur-api/types-cloudflare-generes.d.ts", "outils/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["application-web/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ["configuration/**/*.{ts,js}"],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
);
