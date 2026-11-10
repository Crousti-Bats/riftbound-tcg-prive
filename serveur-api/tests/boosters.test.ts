/** Tests du moteur de boosters : stock, pools, tirage, statistiques et API. */
import { beforeEach, describe, expect, it } from "vitest";
import { aleatoireSeede } from "../boosters/aleatoire";
import { COMPOSITION, INTERVALLE_REGEN_MS, STOCK_MAX, TOTAL_CARTES_BOOSTER } from "../boosters/configuration-taux";
import { construirePools, viderCachePools } from "../boosters/pools";
import { prochainDansMs, regenerer } from "../boosters/stock";
import { tirerBooster } from "../boosters/tirage-booster";
import type { CarteCatalogue } from "../catalogue/types-catalogue";
import { amorcerCataloguePourTest, viderCacheMemoire } from "../catalogue/source-cartes";
import { catalogueDeTest } from "./outils/catalogue-de-test";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

const MIN = 60_000;

beforeEach(() => {
  viderCacheMemoire();
  viderCachePools();
});

describe("Stock de boosters (régénération paresseuse)", () => {
  const T0 = 1_700_000_000_000;

  it("règle du 2026-11-10 : 10 boosters au maximum, +1 toutes les 20 minutes", () => {
    expect(STOCK_MAX).toBe(10);
    expect(INTERVALLE_REGEN_MS).toBe(20 * MIN);
  });

  it("ajoute 1 booster toutes les 20 minutes", () => {
    expect(regenerer(5, T0, T0 + 50 * MIN).stock).toBe(7);
  });

  it("plafonne à 10", () => {
    expect(regenerer(9, T0, T0 + 1000 * MIN).stock).toBe(STOCK_MAX);
  });

  it("au plafond, le tick revient à maintenant et il n'y a aucun gain", () => {
    const e = regenerer(10, T0, T0 + 50 * MIN);
    expect(e.stock).toBe(10);
    expect(e.tick).toBe(T0 + 50 * MIN);
  });

  it("préserve la progression partielle (le tick n'avance que des intervalles entiers)", () => {
    const e = regenerer(5, T0, T0 + 50 * MIN);
    expect(e.stock).toBe(7);
    expect(e.tick).toBe(T0 + 40 * MIN);
    expect(prochainDansMs(e, T0 + 50 * MIN)).toBe(10 * MIN);
  });

  it("ne régresse pas si l'horloge recule", () => {
    expect(regenerer(5, T0, T0 - 5 * MIN).stock).toBe(5);
  });

  it("prochainDansMs vaut null au plafond", () => {
    expect(prochainDansMs({ stock: STOCK_MAX, tick: T0 }, T0)).toBeNull();
  });
});

describe("Pools de tirage", () => {
  it("exclut runes et tokens des pools de rareté", () => {
    const ogn = construirePools(catalogueDeTest()).parSet["ogn"];
    expect(ogn?.commons).toHaveLength(10); // les 2 runes Common d'ogn ne polluent pas les commons
    expect(ogn?.runes.length).toBeGreaterThan(0);
    const sfd = construirePools(catalogueDeTest()).parSet["sfd"];
    expect(sfd?.tokens.length).toBeGreaterThan(0);
    expect(sfd?.commons.every((c) => !c.includes("tok"))).toBe(true);
  });

  it("inclut les Légendes (Rare) et les Terrains (Uncommon) dans leurs pools", () => {
    const ogn = construirePools(catalogueDeTest()).parSet["ogn"];
    expect(ogn?.rares).toContain("ogn-leg");
    expect(ogn?.uncommons).toContain("ogn-bf");
  });

  it("repère les runes d'Origins (variante base, type Rune) pour le repli", () => {
    expect(construirePools(catalogueDeTest()).runesOrigins.length).toBeGreaterThan(0);
  });
});

describe("Tirage d'un booster (structure)", () => {
  it("produit toujours 14 cartes avec la bonne composition", () => {
    const pools = construirePools(catalogueDeTest());
    const alea = aleatoireSeede(7);
    for (let i = 0; i < 2000; i++) {
      const b = tirerBooster(pools, "ogn", alea);
      expect(b).toHaveLength(TOTAL_CARTES_BOOSTER);
      expect(b.filter((x) => x.slot === "common")).toHaveLength(COMPOSITION.common);
      expect(b.filter((x) => x.slot === "uncommon")).toHaveLength(COMPOSITION.uncommon);
      expect(b.filter((x) => x.slot === "foil")).toHaveLength(COMPOSITION.foil);
      expect(b.filter((x) => x.slot === "rarePlus")).toHaveLength(COMPOSITION.rarePlus);
      expect(b.filter((x) => x.slot === "runeToken")).toHaveLength(COMPOSITION.runeToken);
      expect(b.filter((x) => x.foil)).toHaveLength(1);
    }
  });

  it("set sans rune → token ; set sans rune ni token → rune d'Origins", () => {
    const catalogue = catalogueDeTest();
    const pools = construirePools(catalogue);
    const type = new Map(catalogue.cartes.map((c) => [c.code, c.type.toLowerCase()]));
    const alea = aleatoireSeede(3);
    for (let i = 0; i < 300; i++) {
      const sfd = tirerBooster(pools, "sfd", alea).find((x) => x.slot === "runeToken");
      expect(type.get(sfd?.code ?? "")).toBe("token");
      const rad = tirerBooster(pools, "rad", alea).find((x) => x.slot === "runeToken");
      expect(rad?.code.startsWith("ogn-")).toBe(true); // repli sur les runes d'Origins
    }
  });
});

describe("Statistiques sur 100 000 boosters (aléatoire seedé, déterministe)", () => {
  const catalogue = catalogueDeTest();
  const pools = construirePools(catalogue);
  const infos = new Map<string, CarteCatalogue>(catalogue.cartes.map((c) => [c.code, c]));
  const N = 100_000;

  interface Compte {
    epic: number;
    alt: number;
    over: number;
    signee: number;
    special: number;
    ultime: number;
    rare: number;
    rune: number;
    runeAlt: number;
    token: number;
    foil: { Common: number; Uncommon: number; Rare: number; Epic: number };
  }

  function simuler(set: string, graine: number): Compte {
    const alea = aleatoireSeede(graine);
    const c: Compte = {
      epic: 0, alt: 0, over: 0, signee: 0, special: 0, ultime: 0, rare: 0,
      rune: 0, runeAlt: 0, token: 0, foil: { Common: 0, Uncommon: 0, Rare: 0, Epic: 0 },
    };
    for (let i = 0; i < N; i++) {
      for (const t of tirerBooster(pools, set, alea)) {
        const info = infos.get(t.code);
        if (!info) continue;
        if (t.slot === "foil" && info.rarete !== "Showcase") c.foil[info.rarete]++;
        if (t.slot === "runeToken") {
          if (info.variante === "rune_alt") c.runeAlt++;
          else if (info.type.toLowerCase() === "rune") c.rune++;
          else c.token++;
        }
        switch (info.variante) {
          case "base":
            if (info.rarete === "Epic") c.epic++;
            else if (info.rarete === "Rare") c.rare++;
            break;
          case "alt": c.alt++; break;
          case "overnumbered": c.over++; break;
          case "signee": c.signee++; break;
          case "special": c.special++; break;
          case "ultime": c.ultime++; break;
        }
      }
    }
    return c;
  }

  const dans = (valeur: number, bas: number, haut: number) => {
    expect(valeur).toBeGreaterThanOrEqual(bas);
    expect(valeur).toBeLessThanOrEqual(haut);
  };

  it("respecte les fréquences par booster (Unleashed : Special + Ultime présents)", () => {
    const c = simuler("unl", 12345);
    const f = (n: number) => n / N;
    // Taux du 2026-11-10 (divisés par 2 une seconde fois).
    dans(f(c.epic), 0.037, 0.0465); //    ~4,2 % (2 slots Rare+ + part Foil) : 1 booster sur 24
    dans(f(c.alt), 0.018, 0.024); //      ~2,1 % : 1 sur 48
    dans(f(c.over), 0.0026, 0.0044); //   ~0,35 % : 1 sur 288
    dans(f(c.signee), 0.0006, 0.0016); // ~0,10 % : 1 sur 960
    dans(f(c.special), 0.00005, 0.0005); // ~0,025 % : 1 sur 4000
    dans(f(c.ultime), 0.00005, 0.0005); //  ~0,025 %
    // Slot Foil : 75 % Common, 20 % Uncommon, 4 % Rare, 1 % Epic.
    dans(c.foil.Common / N, 0.73, 0.77);
    dans(c.foil.Uncommon / N, 0.18, 0.22);
    dans(c.foil.Rare / N, 0.032, 0.048);
    dans(c.foil.Epic / N, 0.007, 0.013);
  }, 30_000);

  it("slot Rune : 92 % rune, 8 % rune alt (Origins)", () => {
    const c = simuler("ogn", 999);
    const total = c.rune + c.runeAlt;
    expect(total).toBe(N); // ogn a des runes : tout le slot est une rune
    expect(c.token).toBe(0);
    dans(c.rune / total, 0.9, 0.94);
  }, 30_000);

  it("set sans Special ni Ultime (Vendetta) : leur probabilité revient aux Rares", () => {
    const c = simuler("ven", 2024);
    expect(c.special).toBe(0);
    expect(c.ultime).toBe(0);
    dans(c.epic / N, 0.037, 0.0465); // les autres taux restent inchangés
    expect(c.rare / N).toBeGreaterThan(1.85); // ~1,9 Rare par booster (2 slots ≈ 0,938 chacun + les Rare+ ratés)
  }, 30_000);
});

describe("API /api/boosters", () => {
  type Etat = { stock: { actuel: number; max: number; prochainDansMs: number | null; offerts: number }; sets: Array<{ code: string }> };
  type Ouverture = { set: string; cartes: Array<{ code: string; foil: boolean; slot: string }>; stock: Etat["stock"] };

  beforeEach(() => amorcerCataloguePourTest(catalogueDeTest()));

  function totalCollection(bd: ReturnType<typeof creerEnvironnementDeTest>["bd"], pseudo: string): number {
    const ligne = bd
      .prepare(
        "SELECT COALESCE(SUM(quantite), 0) AS n FROM collection WHERE compte_id = (SELECT id FROM comptes WHERE pseudo = ?)",
      )
      .get(pseudo) as { n: number };
    return Number(ligne.n);
  }

  it("un nouveau compte démarre avec 10 boosters", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const r = await env.appeler("GET", "/api/boosters/etat", { cookie });
    expect(r.statut).toBe(200);
    expect((r.json as unknown as Etat).stock.actuel).toBe(10);
    expect((r.json as unknown as Etat).sets.some((s) => s.code === "ogn")).toBe(true);
  });

  it("ouvrir consomme 1 booster, rend 14 cartes et alimente la collection", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");

    const r = await env.appeler("POST", "/api/boosters/ouvrir", { cookie, corps: { set: "ogn" } });
    expect(r.statut).toBe(200);
    const ouverture = r.json as unknown as Ouverture;
    expect(ouverture.cartes).toHaveLength(14);
    expect(ouverture.cartes.filter((c) => c.foil)).toHaveLength(1);
    // Chaque carte est complète : la fiche du site lit domaines, set, texte… (sinon page blanche au clic).
    for (const carte of ouverture.cartes as unknown as Array<Record<string, unknown>>) {
      expect(Array.isArray(carte.domaines)).toBe(true);
      for (const champ of ["nom", "set", "numero", "rarete", "variante", "type", "image", "orientation"]) {
        expect(typeof carte[champ]).toBe("string");
      }
      for (const champ of ["sousTitre", "energie", "puissance", "force", "texte", "artiste"]) {
        expect(champ in carte).toBe(true);
      }
    }
    expect(ouverture.stock.actuel).toBe(9);
    expect(totalCollection(env.bd, "Alice")).toBe(14);

    // La carte foil est comptée séparément de la normale.
    const foils = env.bd
      .prepare(
        "SELECT COUNT(*) AS n FROM collection WHERE est_foil = 1 AND compte_id = (SELECT id FROM comptes WHERE pseudo = ?)",
      )
      .get("Alice") as { n: number };
    expect(Number(foils.n)).toBeGreaterThanOrEqual(1);

    // Ré-ouvrir accumule les quantités.
    const r2 = await env.appeler("POST", "/api/boosters/ouvrir", { cookie, corps: { set: "ogn" } });
    expect((r2.json as unknown as Ouverture).stock.actuel).toBe(8);
    expect(totalCollection(env.bd, "Alice")).toBe(28);
  });

  it("régénère le stock avec le temps (+1 / 20 min, plafond 10)", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    env.bd
      .prepare("UPDATE comptes SET stock_boosters = 5, boosters_tick = ? WHERE pseudo = ?")
      .run(Date.now() - 50 * MIN, "Alice");
    const r = await env.appeler("GET", "/api/boosters/etat", { cookie });
    expect((r.json as unknown as Etat).stock.actuel).toBe(7);
  });

  it("refuse l'ouverture sans booster (409)", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    env.bd.prepare("UPDATE comptes SET stock_boosters = 0, boosters_tick = ? WHERE pseudo = ?").run(Date.now(), "Alice");
    const r = await env.appeler("POST", "/api/boosters/ouvrir", { cookie, corps: { set: "ogn" } });
    expect(r.statut).toBe(409);
    expect(r.json.erreur).toBe("aucun_booster");
    expect(totalCollection(env.bd, "Alice")).toBe(0);
  });

  it("ouvre les boosters offerts une fois le stock normal épuisé", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    // Un nouveau compte n'a pas de booster offert.
    const avant = await env.appeler("GET", "/api/boosters/etat", { cookie });
    expect((avant.json as unknown as Etat).stock.offerts).toBe(0);

    env.bd.prepare("UPDATE comptes SET stock_boosters = 1, boosters_tick = ?, boosters_bonus = 2 WHERE pseudo = ?").run(Date.now(), "Alice");
    const etat = await env.appeler("GET", "/api/boosters/etat", { cookie });
    expect((etat.json as unknown as Etat).stock).toMatchObject({ actuel: 1, offerts: 2 });

    // 1er : le stock normal passe en premier.
    const r1 = await env.appeler("POST", "/api/boosters/ouvrir", { cookie, corps: { set: "ogn" } });
    expect((r1.json as unknown as Ouverture).stock).toMatchObject({ actuel: 0, offerts: 2 });
    // 2e et 3e : les boosters offerts.
    const r2 = await env.appeler("POST", "/api/boosters/ouvrir", { cookie, corps: { set: "ogn" } });
    expect(r2.statut).toBe(200);
    expect((r2.json as unknown as Ouverture).stock).toMatchObject({ actuel: 0, offerts: 1 });
    const r3 = await env.appeler("POST", "/api/boosters/ouvrir", { cookie, corps: { set: "ogn" } });
    expect((r3.json as unknown as Ouverture).stock).toMatchObject({ actuel: 0, offerts: 0 });
    expect(totalCollection(env.bd, "Alice")).toBe(42);

    // Plus rien : 409, et le minuteur du stock normal tourne toujours.
    const r4 = await env.appeler("POST", "/api/boosters/ouvrir", { cookie, corps: { set: "ogn" } });
    expect(r4.statut).toBe(409);
    expect(r4.json.erreur).toBe("aucun_booster");
  });

  it("garde les boosters offerts au-delà du plafond de 10", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    env.bd.prepare("UPDATE comptes SET boosters_bonus = 10 WHERE pseudo = ?").run("Alice");
    const etat = await env.appeler("GET", "/api/boosters/etat", { cookie });
    expect((etat.json as unknown as Etat).stock).toMatchObject({ actuel: STOCK_MAX, max: STOCK_MAX, offerts: 10 });
  });

  it("refuse un set non ouvrable ou inconnu (400)", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const starter = await env.appeler("POST", "/api/boosters/ouvrir", { cookie, corps: { set: "ogs" } });
    expect(starter.statut).toBe(400);
    expect(starter.json.erreur).toBe("set_non_ouvrable");
    const inconnu = await env.appeler("POST", "/api/boosters/ouvrir", { cookie, corps: { set: "zz" } });
    expect(inconnu.statut).toBe(400);
  });

  it("refuse l'accès sans connexion (401)", async () => {
    const env = creerEnvironnementDeTest();
    const etat = await env.appeler("GET", "/api/boosters/etat", {});
    expect(etat.statut).toBe(401);
    const ouvrir = await env.appeler("POST", "/api/boosters/ouvrir", { corps: { set: "ogn" } });
    expect(ouvrir.statut).toBe(401);
  });
});
