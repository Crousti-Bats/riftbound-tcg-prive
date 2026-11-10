import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITES_GRATUITES, lireQuotas, viderCacheQuotas } from "../administration/quotas-cloudflare";
import { estRemarquable } from "../boosters/routes-boosters";
import { amorcerCataloguePourTest } from "../catalogue/source-cartes";
import type { CarteCatalogue } from "../catalogue/types-catalogue";
import { catalogueDeTest } from "./outils/catalogue-de-test";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

const MDP = "mot-de-passe-admin-solide";
type Env = ReturnType<typeof creerEnvironnementDeTest>;
type Monitoring = {
  joueurs: { total: number; enLigne: number; invitationsEnAttente: number; recents: Array<{ pseudo: string }> };
  activite: {
    boosters: { derniereHeure: number; dernieres24h: number; parSet24h: Array<{ set: string; n: number }> };
    echanges24h: { proposes: number };
    tiragesRemarquables: Array<{ code: string; nom: string; pseudo: string }>;
  };
  securite: {
    evenements: Record<string, { derniereHeure: number; dernieres24h: number }>;
    blocagesActifs: Array<{ cle: string }>;
    erreurs24h: number;
    dernieresErreurs: Array<{ chemin: string; message: string; methode: string }>;
  };
  sante: { base: string; catalogue: { cartes: number } | null };
  quotas: { statut: string };
};

async function adminEleve(t: Env) {
  const cookie = await t.inscrire("Crousti", MDP, "admin");
  expect((await t.appeler("POST", "/api/admin/elevation", { cookie, corps: { motDePasse: MDP } })).statut).toBe(200);
  return cookie;
}

async function monitoring(t: Env, cookie: string) {
  const r = await t.appeler("GET", "/api/admin/monitoring", { cookie });
  expect(r.statut).toBe(200);
  return r.json as unknown as Monitoring;
}

beforeEach(() => amorcerCataloguePourTest(catalogueDeTest()));
afterEach(() => {
  vi.useRealTimers();
  viderCacheQuotas();
});

describe("Monitoring : contrôle d'accès", () => {
  it("joueur 403, visiteur 401, admin sans élévation 403", async () => {
    const t = creerEnvironnementDeTest();
    expect((await t.appeler("GET", "/api/admin/monitoring")).statut).toBe(401);
    const joueur = await t.inscrire("Alice", "mot-de-passe-joueur");
    expect((await t.appeler("GET", "/api/admin/monitoring", { cookie: joueur })).statut).toBe(403);
    const admin = await t.inscrire("Crousti", MDP, "admin");
    const r = await t.appeler("GET", "/api/admin/monitoring", { cookie: admin });
    expect(r.statut).toBe(403);
    expect(r.json.erreur).toBe("elevation_requise");
  });

  it("le rafraîchissement automatique NE prolonge PAS l'accès admin", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = creerEnvironnementDeTest();
    const cookie = await adminEleve(t);
    vi.setSystemTime(Date.now() + 10 * 60_000);
    await monitoring(t, cookie);
    vi.setSystemTime(Date.now() + 6 * 60_000); // 16 min après l'élévation : fermé, malgré le polling
    const r = await t.appeler("GET", "/api/admin/monitoring", { cookie });
    expect(r.json.erreur).toBe("elevation_requise");
  });
});

describe("Monitoring : contenu", () => {
  it("compte les joueurs, invitations, boosters, échecs de connexion et blocages", async () => {
    const t = creerEnvironnementDeTest();
    const admin = await adminEleve(t);
    const alice = await t.inscrire("Alice", "mot-de-passe-joueur");
    await t.creerInvitation(); // une invitation en attente

    for (let i = 0; i < 3; i++) {
      expect((await t.appeler("POST", "/api/boosters/ouvrir", { cookie: alice, corps: { set: "ogn" } })).statut).toBe(200);
    }
    // 5 échecs sur le même pseudo : le pseudo est bloqué.
    for (let i = 0; i < 5; i++) {
      await t.appeler("POST", "/api/auth/connexion", { corps: { pseudo: "Alice", motDePasse: "mauvais" }, ip: `198.51.100.${i}` });
    }

    const m = await monitoring(t, admin);
    expect(m.joueurs.total).toBe(2);
    expect(m.joueurs.enLigne).toBe(2);
    expect(m.joueurs.recents.map((j) => j.pseudo).sort()).toEqual(["Alice", "Crousti"]);
    expect(m.joueurs.invitationsEnAttente).toBe(1);
    expect(m.activite.boosters.derniereHeure).toBe(3);
    expect(m.activite.boosters.dernieres24h).toBe(3);
    expect(m.activite.boosters.parSet24h).toEqual([expect.objectContaining({ set: "ogn", n: 3 })]);
    expect(m.securite.evenements.connexion_echouee?.derniereHeure).toBe(5);
    expect(m.securite.blocagesActifs.map((b) => b.cle)).toContain("connexion:pseudo:alice");
    expect(m.sante.base).toBe("ok");
    expect(m.sante.catalogue?.cartes).toBeGreaterThan(0);
    expect(m.quotas.statut).toBe("non_configure"); // pas de jeton dans les tests
  });

  it("trace exactement les cartes remarquables tirées (Epic et au-delà)", async () => {
    const t = creerEnvironnementDeTest();
    const admin = await adminEleve(t);
    const infos = new Map<string, CarteCatalogue>(catalogueDeTest().cartes.map((c) => [c.code, c]));
    let attendues = 0;
    for (let i = 0; i < 10; i++) {
      const r = await t.appeler("POST", "/api/boosters/ouvrir", { cookie: admin, corps: { set: "unl" } });
      const cartes = r.json.cartes as Array<{ code: string }>;
      attendues += cartes.filter((c) => {
        const info = infos.get(c.code);
        return info ? estRemarquable(info) : false;
      }).length;
    }
    const enBase = t.bd.prepare("SELECT COUNT(*) AS n FROM tirages_remarquables").get() as { n: number };
    expect(Number(enBase.n)).toBe(attendues);
    const m = await monitoring(t, admin);
    expect(m.activite.tiragesRemarquables).toHaveLength(Math.min(15, attendues)); // 10 boosters (stock maximum), 15 lignes au plus
    for (const tir of m.activite.tiragesRemarquables) expect(tir.pseudo).toBe("Crousti");
  });

  it("enregistre les erreurs serveur (500) sans détail renvoyé au client", async () => {
    const t = creerEnvironnementDeTest();
    const admin = await adminEleve(t);
    const alice = await t.inscrire("Alice", "mot-de-passe-joueur");
    t.bd.exec("DROP TABLE echanges_cartes"); // provoque une vraie erreur interne
    const r = await t.appeler("GET", "/api/echanges", { cookie: alice });
    expect(r.statut).toBe(500);
    expect(r.texte).not.toContain("echanges_cartes");
    await new Promise((fin) => setTimeout(fin, 0)); // l'écriture est faite en arrière-plan

    const m = await monitoring(t, admin);
    expect(m.securite.erreurs24h).toBe(1);
    expect(m.securite.dernieresErreurs[0]).toMatchObject({ methode: "GET", chemin: "/api/echanges" });
    expect(m.securite.dernieresErreurs[0]?.message.length).toBeLessThanOrEqual(300);
  });
});

describe("Quotas Cloudflare (API GraphQL)", () => {
  const config = { idCompte: "14bd3e99e009ec33efebde236223ab6a", jeton: "jeton-de-test" };
  const reponseOk = {
    data: {
      viewer: {
        accounts: [
          {
            workersInvocationsAdaptive: [{ sum: { requests: 1200, errors: 3 } }, { sum: { requests: 34, errors: 0 } }],
            d1AnalyticsAdaptiveGroups: [{ sum: { rowsRead: 50_000, rowsWritten: 900 } }],
          },
        ],
      },
    },
    errors: null,
  };

  it("non configuré sans jeton ou avec un ID de compte invalide", async () => {
    expect((await lireQuotas({ idCompte: config.idCompte, jeton: undefined })).statut).toBe("non_configure");
    expect((await lireQuotas({ idCompte: "pas-un-id", jeton: "x" })).statut).toBe("non_configure");
  });

  it("additionne les compteurs du jour, envoie le jeton en en-tête et ne le renvoie jamais", async () => {
    const appels: Array<{ url: string; init: RequestInit }> = [];
    const telecharger = (url: string, init: RequestInit) => {
      appels.push({ url, init });
      return Promise.resolve(Response.json(reponseOk));
    };
    const maintenant = Date.parse("2026-11-09T14:30:00Z");
    const q = await lireQuotas(config, telecharger, maintenant);
    expect(q).toMatchObject({
      statut: "ok",
      depuis: "2026-11-09T00:00:00Z",
      requetesWorker: 1234,
      erreursWorker: 3,
      lignesLuesD1: 50_000,
      lignesEcritesD1: 900,
      limites: LIMITES_GRATUITES,
    });
    expect(JSON.stringify(q)).not.toContain("jeton-de-test");
    expect(appels[0]?.url).toBe("https://api.cloudflare.com/client/v4/graphql");
    expect((appels[0]?.init.headers as Record<string, string>).Authorization).toBe("Bearer jeton-de-test");
    const corps = JSON.parse(String(appels[0]?.init.body)) as { variables: Record<string, string> };
    expect(corps.variables).toMatchObject({ compte: config.idCompte, jour: "2026-11-09", debut: "2026-11-09T00:00:00Z" });

    // Mis en cache 60 s : pas de second appel.
    await lireQuotas(config, telecharger, maintenant + 30_000);
    expect(appels).toHaveLength(1);
    await lireQuotas(config, telecharger, maintenant + 61_000);
    expect(appels).toHaveLength(2);
  });

  it("gère les erreurs HTTP, GraphQL, réseau et les réponses inattendues", async () => {
    const t0 = Date.parse("2026-11-09T10:00:00Z");
    const essai = async (rep: () => Promise<Response>, decalage: number) => {
      viderCacheQuotas();
      return lireQuotas(config, rep, t0 + decalage);
    };
    expect(await essai(() => Promise.resolve(new Response("non", { status: 403 })), 0)).toMatchObject({
      statut: "erreur",
      message: "API Cloudflare : HTTP 403",
    });
    expect(
      await essai(() => Promise.resolve(Response.json({ data: null, errors: [{ message: "not authorized" }] })), 1),
    ).toMatchObject({ statut: "erreur", message: "API Cloudflare : not authorized" });
    expect(await essai(() => Promise.reject(new Error("réseau https://secret")), 2)).toMatchObject({
      statut: "erreur",
      message: "API Cloudflare injoignable",
    });
    expect(await essai(() => Promise.resolve(Response.json({ data: { viewer: "?" } })), 3)).toMatchObject({
      statut: "erreur",
      message: "API Cloudflare : réponse inattendue",
    });
  });
});
