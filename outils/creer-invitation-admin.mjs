#!/usr/bin/env node
/**
 * Crée une invitation ADMIN (valable 1 heure, réservée à un pseudo) directement dans la base D1.
 * C'est le SEUL moyen de créer un compte admin : le site ne peut créer que des invitations "joueur".
 * Il faut être connecté à Cloudflare (npx wrangler login) : seul le propriétaire du compte peut le faire.
 *
 * Usage :
 *   npm run admin:invitation -- --pseudo Crousti --production   (base en ligne)
 *   npm run admin:invitation -- --pseudo Crousti --local        (base de développement)
 *
 * Le code n'est affiché qu'une fois et n'est stocké nulle part en clair (seulement son empreinte SHA-256).
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const WRANGLER = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const CONFIG = fileURLToPath(new URL("../configuration/cloudflare-wrangler.jsonc", import.meta.url));
const ETAT_LOCAL = fileURLToPath(new URL("../.wrangler/state", import.meta.url));

const URL_PRODUCTION = "https://riftbound-tcg.axelgirard.workers.dev";
const URL_LOCALE = "http://localhost:5173";

const args = process.argv.slice(2);
const pseudo = args[args.indexOf("--pseudo") + 1] ?? "";
const production = args.includes("--production");
const locale = args.includes("--local");

if (!/^[A-Za-z0-9_-]{3,20}$/.test(pseudo) || args.indexOf("--pseudo") === -1) {
  console.error("Pseudo invalide. Exemple : npm run admin:invitation -- --pseudo Crousti --production");
  process.exit(1);
}
if (production === locale) {
  console.error("Préciser --production (base en ligne) OU --local (base de développement).");
  process.exit(1);
}

const code = randomBytes(32).toString("base64url");
const empreinte = createHash("sha256").update(code).digest("hex");
const maintenant = Date.now();
const expiration = maintenant + 60 * 60_000;

// Toutes les valeurs sont contrôlées : empreinte hexadécimale, pseudo validé par regex, nombres.
const sql =
  "INSERT INTO invitations (code_hash, role, pseudo_reserve, note, cree_le, expire_le) " +
  `VALUES ('${empreinte}', 'admin', '${pseudo}', 'Invitation admin (ligne de commande)', ${maintenant}, ${expiration}); ` +
  "INSERT INTO journal (horodatage, categorie, type, pseudo, details) " +
  `VALUES (${maintenant}, 'admin', 'invitation_admin_creee', '${pseudo}', 'source: ligne de commande');`;

// --command (API "query") et non --file : l'API "import" utilisée par --file refuse la connexion OAuth de wrangler login.
// Wrangler est lancé directement par Node, sans shell : aucun problème de guillemets sous Windows.
const resultat = spawnSync(
  process.execPath,
  [
    WRANGLER, "d1", "execute", "riftbound-tcg",
    production ? "--remote" : "--local",
    "--config", CONFIG,
    ...(locale ? ["--persist-to", ETAT_LOCAL] : []),
    "--command", sql,
    "--yes",
  ],
  { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
);
if (resultat.status !== 0) {
  console.error(resultat.stdout, resultat.stderr);
  console.error("Échec de la création de l'invitation (es-tu connecté ? npx wrangler login).");
  process.exit(1);
}

const base = production ? URL_PRODUCTION : URL_LOCALE;
console.log("\n✅ Invitation ADMIN créée pour le pseudo", pseudo, "— valable 1 heure, utilisable une seule fois.\n");
console.log("Ouvre ce lien dans ton navigateur, choisis ton mot de passe (12 caractères minimum) :\n");
console.log(`   ${base}/inscription#code=${code}\n`);
console.log("Ne partage pas ce lien. Il ne sera plus jamais affiché.\n");
