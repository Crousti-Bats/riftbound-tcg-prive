/** Point d'entrée de l'API : assemble les middlewares de sécurité et les routes. */
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { routesAdministration } from "./administration/routes-administration";
import { routesAuthentification } from "./authentification/routes-authentification";
import { chargerSession } from "./authentification/sessions";
import { routesBoosters } from "./boosters/routes-boosters";
import { routesCatalogue } from "./catalogue/routes-catalogue";
import { routesCollection } from "./collection/routes-collection";
import { routesEchanges } from "./echanges/routes-echanges";
import { securityHeaders } from "./entetes-securite";
import { protectionCsrf } from "./securite/protection-csrf";
import type { ContexteApi } from "./types-application";

export const app = new Hono<ContexteApi>();

app.use("*", securityHeaders);
app.use("/api/*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ erreur: "requete_trop_grande" }, 413) }));
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

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  console.error(err);
  // Jamais de détail d'erreur interne renvoyé au client.
  return c.json({ error: "internal_error" }, 500);
});

export default app;
