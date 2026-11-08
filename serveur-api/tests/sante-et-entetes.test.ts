import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS } from "../entetes-securite";
import { app } from "../point-entree-api";

/** Fausse base D1 : répond normalement, ou échoue si `enPanne` est vrai. */
function fausseBase(enPanne = false) {
  return {
    prepare: () => ({
      first: async () => {
        if (enPanne) throw new Error("D1 indisponible");
        return { 1: 1 };
      },
    }),
  } as unknown as D1Database;
}

const env = (enPanne = false) => ({ BASE_DE_DONNEES: fausseBase(enPanne) }) as unknown as Env;

describe("API", () => {
  it("GET /api/health répond ok quand la base répond", async () => {
    const res = await app.request("/api/health", {}, env());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", service: "riftbound-tcg", base: "ok" });
  });

  it("GET /api/health répond 503 sans détail interne quand la base est en panne", async () => {
    const res = await app.request("/api/health", {}, env(true));
    expect(res.status).toBe(503);
    const corps = await res.text();
    expect(JSON.parse(corps)).toEqual({ status: "degrade", service: "riftbound-tcg", base: "injoignable" });
    expect(corps).not.toContain("D1 indisponible");
  });

  it("route inconnue -> 404 JSON", async () => {
    const res = await app.request("/api/inexistant", {}, env());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("applique les en-têtes de sécurité", async () => {
    const res = await app.request("/api/health", {}, env());
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(k)).toBe(v);
  });
});
