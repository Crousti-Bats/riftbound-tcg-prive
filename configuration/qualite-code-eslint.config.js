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
    // Service worker de la PWA (JavaScript simple, exécuté par le navigateur hors de la page).
    files: ["application-web/service-worker/**/*.js"],
    languageOptions: { globals: globals.serviceworker, sourceType: "script" },
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
  {
    // SÉCURITÉ : le SQL passé à .prepare() doit être un texte fixe. Les valeurs passent par .bind().
    files: ["serveur-api/**/*.ts"],
    // Seule exception : la fausse base de test, qui transmet le SQL (déjà fixe) à SQLite.
    ignores: ["serveur-api/tests/outils/base-d1-de-test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='prepare'][arguments.0.type!='Literal'][arguments.0.type!='TemplateLiteral']",
          message: "SQL non préparé interdit : .prepare() n'accepte qu'un texte SQL fixe. Utiliser des ? et .bind().",
        },
        {
          selector: "CallExpression[callee.property.name='prepare'] > TemplateLiteral.arguments[expressions.length>0]",
          message: "SQL non préparé interdit : pas de ${...} dans le SQL. Utiliser des ? et .bind().",
        },
      ],
    },
  },
);
