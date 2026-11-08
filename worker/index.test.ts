import { describe, expect, it } from "vitest";
import { app } from "./index";
import { SECURITY_HEADERS } from "./security";

const env = {} as Env;

describe("API", () => {
  it("GET /api/health répond ok", async () => {
    const res = await app.request("/api/health", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", service: "riftbound-tcg" });
  });

  it("route inconnue -> 404 JSON", async () => {
    const res = await app.request("/api/inexistant", {}, env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("applique les en-têtes de sécurité", async () => {
    const res = await app.request("/api/health", {}, env);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(k)).toBe(v);
  });
});
