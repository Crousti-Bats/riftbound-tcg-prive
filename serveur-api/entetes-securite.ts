import type { MiddlewareHandler } from "hono";

/** En-têtes de sécurité appliqués à toutes les réponses de l'API. */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' https://cmsassets.rgpub.io data:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cache-Control": "no-store",
};

/**
 * Une route peut fixer elle-même ces deux en-têtes (ex. photo de profil : cache long et CSP « sandbox », plus
 * stricte). Sinon, les valeurs ci-dessus s'appliquent. Tous les autres en-têtes sont toujours imposés.
 */
const FIXABLES_PAR_LA_ROUTE = new Set(["Cache-Control", "Content-Security-Policy"]);

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (FIXABLES_PAR_LA_ROUTE.has(k) && c.res.headers.has(k)) continue;
    c.res.headers.set(k, v);
  }
};
