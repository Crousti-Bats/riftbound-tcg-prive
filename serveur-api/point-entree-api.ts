import { Hono } from "hono";
import { securityHeaders } from "./entetes-securite";

export const app = new Hono<{ Bindings: Env }>();

app.use("*", securityHeaders);

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

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  console.error(err);
  // Jamais de détail d'erreur interne renvoyé au client.
  return c.json({ error: "internal_error" }, 500);
});

export default app;
