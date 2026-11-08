/**
 * Protection CSRF (requête forgée depuis un autre site).
 * En plus du cookie SameSite=Strict, toute requête qui modifie quelque chose (POST, PUT, PATCH, DELETE)
 * doit venir de notre propre origine et envoyer du JSON.
 */
import type { MiddlewareHandler } from "hono";

const METHODES_SURES = new Set(["GET", "HEAD", "OPTIONS"]);

export const protectionCsrf: MiddlewareHandler = async (c, next) => {
  if (METHODES_SURES.has(c.req.method)) return next();

  const origineAttendue = new URL(c.req.url).origin;
  const origine = c.req.header("Origin");
  if (origine !== origineAttendue) return c.json({ erreur: "origine_refusee" }, 403);

  // Un DELETE n'a pas de corps : seul le contrôle d'origine s'applique.
  const typeContenu = c.req.header("Content-Type") ?? "";
  if (c.req.method !== "DELETE" && !typeContenu.toLowerCase().startsWith("application/json")) {
    return c.json({ erreur: "json_attendu" }, 415);
  }
  return next();
};
