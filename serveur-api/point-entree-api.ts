import { Hono } from "hono";
import { securityHeaders } from "./entetes-securite";

export const app = new Hono<{ Bindings: Env }>();

app.use("*", securityHeaders);

app.get("/api/health", (c) => c.json({ status: "ok", service: "riftbound-tcg" }));

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  console.error(err);
  // Jamais de détail d'erreur interne renvoyé au client.
  return c.json({ error: "internal_error" }, 500);
});

export default app;
