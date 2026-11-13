/** Point d'entrée de l'API : assemble les middlewares de sécurité et les routes. */
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { routesAdministration } from "./administration/routes-administration";
import { routesAuthentification } from "./authentification/routes-authentification";
import { chargerSession } from "./authentification/sessions";
import { routesBoosters } from "./boosters/routes-boosters";
import { routesCatalogue } from "./catalogue/routes-catalogue";
import { routesCollection } from "./collection/routes-collection";
import { routesEchanges } from "./echanges/routes-echanges";
import { securityHeaders } from "./entetes-securite";
import { routesMarche } from "./marche/routes-marche";
import { enregistrerErreurServeur } from "./erreurs-serveur";
import { routesAnnonceSite } from "./annonce-site/routes-annonce-site";
import { prevenirBoostersPleins } from "./notifications/boosters-pleins";
import { clesVapid } from "./notifications/cles-vapid";
import { routesNotifications } from "./notifications/routes-notifications";
import { routesProfils } from "./profils/routes-profils";
import { routesWishlist } from "./wishlist/routes-wishlist";
import { routesDecks } from "./decks/routes-decks";
import { routesEclats } from "./eclats/routes-eclats";
import { routesMiniJeux } from "./minijeux/routes-minijeux";
import { routesParties } from "./table/routes-parties";
import { protectionCsrf } from "./securite/protection-csrf";
import type { ContexteApi } from "./types-application";

export const app = new Hono<ContexteApi>();

app.use("*", securityHeaders);
const trop = (c: Context) => c.json({ erreur: "requete_trop_grande" }, 413);
const limiteNormale = bodyLimit({ maxSize: 16 * 1024, onError: trop });
// Photo de profil : 150 Ko d'image, soit environ 205 Ko en base64 dans le JSON.
const limitePhoto = bodyLimit({ maxSize: 220 * 1024, onError: trop });
app.use("/api/*", (c, next) => (c.req.path === "/api/profils/photo" ? limitePhoto(c, next) : limiteNormale(c, next)));
app.use("/api/*", protectionCsrf);
app.use("/api/*", chargerSession);

/** État du service : répond "ok" si l'API tourne et que la base D1 répond. */
app.get("/api/health", async (c) => {
  try {
    await c.env.BASE_DE_DONNEES.prepare("SELECT 1").first();
    return c.json({ status: "ok", service: "riftbound-tcg", base: "ok" });
  } catch (err) {
    console.error("health: base injoignable", err);
    return c.json({ status: "degrade", service: "riftbound-tcg", base: "injoignable" }, 503);
  }
});

app.route("/api/auth", routesAuthentification);
app.route("/api/admin", routesAdministration);
app.route("/api/catalogue", routesCatalogue);
app.route("/api/boosters", routesBoosters);
app.route("/api/collection", routesCollection);
app.route("/api/echanges", routesEchanges);
app.route("/api/marche", routesMarche);
app.route("/api/annonce-site", routesAnnonceSite);
app.route("/api/notifications", routesNotifications);
app.route("/api/profils", routesProfils);
app.route("/api/wishlist", routesWishlist);
app.route("/api/decks", routesDecks);
app.route("/api/eclats", routesEclats);
app.route("/api/parties", routesParties);
app.route("/api/minijeux", routesMiniJeux);

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  console.error(err);
  // Trace pour le monitoring admin. Ne doit jamais faire échouer la réponse d'erreur elle-même.
  const trace = enregistrerErreurServeur(c.env.BASE_DE_DONNEES, c.req.method, c.req.path, err).catch(() => undefined);
  try {
    c.executionCtx.waitUntil(trace);
  } catch {
    // Pas de contexte d'exécution (tests) : la promesse se termine seule.
  }
  // Jamais de détail d'erreur interne renvoyé au client.
  return c.json({ error: "internal_error" }, 500);
});

/**
 * Tâche planifiée (cron toutes les 5 minutes, voir cloudflare-wrangler.jsonc) :
 * notification « boosters pleins » aux joueurs abonnés.
 */
async function tachePlanifiee(_controleur: ScheduledController, env: ContexteApi["Bindings"]): Promise<void> {
  const cles = clesVapid(env);
  if (!cles) return; // notifications non configurées (clé privée absente)
  try {
    await prevenirBoostersPleins(env.BASE_DE_DONNEES, cles);
  } catch (err) {
    console.error("tâche planifiée : notifications boosters pleins", err);
    await enregistrerErreurServeur(env.BASE_DE_DONNEES, "CRON", "/boosters-pleins", err).catch(() => undefined);
  }
}

/** Durable Object de la table de jeu (binding SALLES, voir cloudflare-wrangler.jsonc). */
export { SalleDeJeu } from "./table/salle-de-jeu";

export default {
  fetch: app.fetch,
  scheduled: tachePlanifiee,
} satisfies ExportedHandler<ContexteApi["Bindings"]>;
