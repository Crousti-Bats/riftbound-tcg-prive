/** Mini-jeux : « Devine le champion » (classique, capacité, illustration) et Memory, avec leurs gains en éclats. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { amorcerCataloguePourTest, viderCacheMemoire } from "../catalogue/source-cartes";
import type { CarteCatalogue, Catalogue } from "../catalogue/types-catalogue";
import {
  centreDuZoom,
  comparer,
  gainDevinette,
  gainMemory,
  jourDeParis,
  jourPrecedent,
  listerChampions,
  texteMasque,
  zoomIllustration,
} from "../minijeux/regles-minijeux";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

type Env = ReturnType<typeof creerEnvironnementDeTest>;

function carte(p: Partial<CarteCatalogue> & Pick<CarteCatalogue, "code" | "nom" | "set">): CarteCatalogue {
  return {
    sousTitre: null,
    numero: p.code.split("-").slice(1).join("-") || "001-100",
    rarete: "Rare",
    variante: "base",
    type: "Unit",
    etiquettes: [],
    tags: [],
    domaines: [],
    image: `https://cmsassets.rgpub.io/${p.code}.png`,
    orientation: "portrait",
    energie: null,
    puissance: null,
    force: null,
    texte: null,
    artiste: null,
    ...p,
  };
}

const legende = (code: string, set: string, champion: string, domaines: string[], texte: string) =>
  carte({ code, set, nom: `Légende ${champion}`, type: "Legend", tags: [champion], domaines, texte });
const unite = (code: string, set: string, champion: string, regions: string[], energie: number, force: number) =>
  carte({ code, set, nom: champion, etiquettes: ["Champion"], tags: [champion, ...regions], energie, force });

/** 4 champions (dont Master Yi avec 2 Légendes) et 10 cartes ordinaires pour le Memory. */
function catalogueMiniJeux(): Catalogue {
  const cartes: CarteCatalogue[] = [
    legende("ogn-255-298", "ogn", "Ahri", ["Calm", "Mind"], "Quand Ahri attaque, pioche 1."),
    unite("ogn-066-298", "ogn", "Ahri", ["Ionia"], 5, 4),
    unite("ogn-067-298", "ogn", "Ahri", ["Ionia"], 3, 3),
    carte({ code: "ogn-068-298", set: "ogn", nom: "Charme", type: "Spell", tags: ["Ahri"] }),
    legende("ogn-251-298", "ogn", "Jinx", ["Fury", "Chaos"], "Défausse 1 : pioche 2."),
    unite("ogn-030-298", "ogn", "Jinx", ["Zaun"], 3, 4),
    legende("unl-191-219", "unl", "Master Yi", ["Calm", "Body"], "Master Yi frappe deux fois."),
    legende("ogs-019-024", "ogs", "Master Yi", ["Calm", "Body"], "Alpha."),
    unite("ogs-005-024", "ogs", "Master Yi", ["Ionia"], 5, 7),
    legende("sfd-193-221", "sfd", "Jax", ["Calm", "Body"], "Jax se défend."),
    unite("sfd-050-221", "sfd", "Jax", [], 5, 4),
    // Unité champion sans Légende : n'est pas un champion du jeu.
    unite("ogn-099-298", "ogn", "Graves", ["Bilgewater"], 4, 4),
    ...Array.from({ length: 10 }, (_, i) => carte({ code: `ogn-1${i}0-298`, set: "ogn", nom: `Carte ${i}` })),
    carte({ code: "ogn-rune0", set: "ogn", nom: "Rune", type: "Rune", rarete: "Common" }),
  ];
  return {
    cartes,
    sets: ["ogn", "ogs", "sfd", "unl"].map((code) => ({ code, nom: code, ouvrable: true, nbCartes: 0, parVariante: {}, parRarete: {} })),
    miseAJourSource: null,
    chargeLe: Date.now(),
    cartesIgnorees: 0,
  };
}

let catalogue: Catalogue;
beforeEach(() => {
  viderCacheMemoire();
  catalogue = catalogueMiniJeux();
  amorcerCataloguePourTest(catalogue);
});
afterEach(() => vi.unstubAllGlobals());

const idDe = (env: Env, pseudo: string) => (env.bd.prepare("SELECT id FROM comptes WHERE pseudo = ?").get(pseudo) as { id: number }).id;
const solde = (env: Env, id: number) => (env.bd.prepare("SELECT eclats FROM comptes WHERE id = ?").get(id) as { eclats: number }).eclats;
const aujourdhui = () => jourDeParis(Date.now());
const fixerDefi = (env: Env, mode: string, reponse: string, jour = aujourdhui()) =>
  env.bd.prepare("INSERT OR REPLACE INTO defis_du_jour (jour, mode, reponse) VALUES (?, ?, ?)").run(jour, mode, reponse);

describe("Règles des mini-jeux", () => {
  it("champions : un nom porté par une unité Champion ET une Légende, identifié par sa première Légende", () => {
    const champions = listerChampions(catalogue);
    expect(champions.map((c) => c.nom)).toEqual(["Ahri", "Jax", "Jinx", "Master Yi"]);
    const ahri = champions.find((c) => c.nom === "Ahri");
    expect(ahri).toMatchObject({ id: "ogn-255-298", regions: ["Ionia"], sortie: "ogn", energie: 3, might: 4, cartes: 4 });
    // Master Yi : la Légende de Proving Grounds (ogs) sort avant celle d'Unleashed.
    expect(champions.find((c) => c.nom === "Master Yi")).toMatchObject({ id: "ogs-019-024", sortie: "ogs" });
    expect(champions.find((c) => c.nom === "Jax")?.regions).toEqual([]);
  });

  it("comparaison : vert, orange, rouge et flèches", () => {
    const [ahri, jax, jinx, yi] = listerChampions(catalogue);
    if (!ahri || !jax || !jinx || !yi) throw new Error("catalogue");
    const c = comparer(jinx, ahri);
    expect(c.domaines.etat).toBe("faux");
    expect(c.regions.etat).toBe("faux");
    expect(c.sortie).toMatchObject({ etat: "juste", sens: null });
    expect(c.energie).toMatchObject({ valeur: 3, etat: "juste" });
    expect(c.cartes).toMatchObject({ valeur: 2, etat: "faux", sens: "plus" });
    const d = comparer(yi, jax);
    expect(d.domaines.etat).toBe("juste");
    expect(d.sortie).toMatchObject({ etat: "faux", sens: "plus" }); // Jax sort après (Spiritforged)
    expect(d.might).toMatchObject({ valeur: 7, sens: "moins" });
    expect(comparer(jax, ahri).domaines.etat).toBe("partiel"); // Calm en commun
    expect(comparer(ahri, ahri)).toMatchObject({ regions: { etat: "juste" }, might: { etat: "juste" } });
  });

  it("gains, zoom, texte masqué et jours (minuit à Paris)", () => {
    expect([1, 2, 5, 11, 50].map((n) => gainDevinette("classique", n))).toEqual([30, 28, 22, 10, 10]);
    expect([1, 3, 20].map((n) => gainDevinette("capacite", n))).toEqual([15, 13, 5]);
    expect([8, 12, 13, 16, 17, 40].map(gainMemory)).toEqual([10, 10, 6, 6, 3, 3]);
    expect([0, 2, 8, 20].map((e) => zoomIllustration(e, false))).toEqual([5, 4, 1, 1]);
    expect(zoomIllustration(0, true)).toBe(1);
    expect(centreDuZoom("2026-11-13", "ogn-255-298")).toEqual(centreDuZoom("2026-11-13", "ogn-255-298"));
    const yi = listerChampions(catalogue).find((c) => c.nom === "Master Yi");
    if (!yi?.legendes[1]) throw new Error("catalogue");
    expect(texteMasque(yi.legendes[1], yi)).toBe("??? frappe deux fois.");
    expect(jourDeParis(Date.parse("2026-11-12T23:30:00Z"))).toBe("2026-11-13"); // heure d'hiver : UTC+1
    expect(jourDeParis(Date.parse("2026-07-01T21:59:00Z"))).toBe("2026-07-01"); // heure d'été : UTC+2
    expect(jourPrecedent("2026-03-01")).toBe("2026-02-28");
  });
});

describe("API « Devine le champion »", () => {
  it("compare chaque essai, refuse les doublons, crédite le gain une seule fois", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idDe(env, "Alice");
    fixerDefi(env, "classique", "ogn-255-298"); // Ahri

    const avant = await env.appeler("GET", "/api/minijeux/devinette/classique", { cookie });
    expect(avant.statut).toBe(200);
    expect(avant.json).toMatchObject({ essais: [], trouve: false, gainPossible: 30, reponse: null });

    const rate = await env.appeler("POST", "/api/minijeux/devinette/classique/essai", { cookie, corps: { champion: "ogn-251-298" } });
    expect(rate.statut).toBe(200);
    expect(rate.json).toMatchObject({ juste: false, gain: 0, solde: 0, etat: { gainPossible: 28 } });
    const etat = rate.json.etat as { essais: Array<{ champion: { nom: string }; comparaison: { regions: { etat: string } } }> };
    expect(etat.essais[0]).toMatchObject({ champion: { nom: "Jinx" }, comparaison: { regions: { etat: "faux" } } });

    expect((await env.appeler("POST", "/api/minijeux/devinette/classique/essai", { cookie, corps: { champion: "ogn-251-298" } })).json).toEqual({
      erreur: "deja_propose",
    });
    expect((await env.appeler("POST", "/api/minijeux/devinette/classique/essai", { cookie, corps: { champion: "ogn-099-298" } })).statut).toBe(400);
    // Une autre Légende du même champion n'est pas un identifiant de champion : seul l'id de la liste est accepté.
    expect((await env.appeler("POST", "/api/minijeux/devinette/classique/essai", { cookie, corps: { champion: "unl-191-219" } })).statut).toBe(400);

    const juste = await env.appeler("POST", "/api/minijeux/devinette/classique/essai", { cookie, corps: { champion: "ogn-255-298" } });
    expect(juste.json).toMatchObject({ juste: true, gain: 28, solde: 28, etat: { trouve: true, reponse: { nom: "Ahri" }, trouvesAujourdhui: 1 } });
    expect(solde(env, id)).toBe(28);
    const encore = await env.appeler("POST", "/api/minijeux/devinette/classique/essai", { cookie, corps: { champion: "sfd-193-221" } });
    expect(encore.json).toEqual({ erreur: "deja_trouve" });
    expect(solde(env, id)).toBe(28);

    const resume = await env.appeler("GET", "/api/minijeux", { cookie });
    expect(resume.json).toMatchObject({ devinette: { classique: { essais: 2, trouve: true, gain: 28 }, capacite: { essais: 0, trouve: false } } });
  });

  it("des bonnes réponses envoyées en même temps ne sont créditées qu'une fois", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    fixerDefi(env, "capacite", "ogn-251-298"); // Jinx
    const reponses = await Promise.all(
      Array.from({ length: 5 }, () => env.appeler("POST", "/api/minijeux/devinette/capacite/essai", { cookie, corps: { champion: "ogn-251-298" } })),
    );
    expect(reponses.filter((r) => r.statut === 200)).toHaveLength(1);
    expect(solde(env, idDe(env, "Alice"))).toBe(15);
  });

  it("ne dévoile jamais la réponse avant qu'elle soit trouvée (texte masqué, illustration servie par le serveur)", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    fixerDefi(env, "capacite", "unl-191-219");
    fixerDefi(env, "illustration", "ogs-005-024");
    const capacite = await env.appeler("GET", "/api/minijeux/devinette/capacite", { cookie });
    expect(capacite.json.indice).toEqual({ texte: "??? frappe deux fois." });
    expect(capacite.texte).not.toMatch(/unl-191-219|Master Yi/);

    const illustration = await env.appeler("GET", "/api/minijeux/devinette/illustration", { cookie });
    expect(illustration.json.indice).toMatchObject({ zoom: 5 });
    expect(illustration.texte).not.toMatch(/ogs-005-024|ogs-019-024|Master Yi/);

    const appels: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      appels.push(url);
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/webp" } });
    });
    const image = await env.appeler("GET", "/api/minijeux/devinette/illustration/image", { cookie });
    expect(image.statut).toBe(200);
    expect(appels).toEqual(["https://cmsassets.rgpub.io/ogs-005-024.png?w=744&fm=webp"]);

    // Chaque erreur dézoome l'illustration.
    const r = await env.appeler("POST", "/api/minijeux/devinette/illustration/essai", { cookie, corps: { champion: "ogn-255-298" } });
    expect(r.json).toMatchObject({ etat: { indice: { zoom: 4.5 } } });
    const ok = await env.appeler("POST", "/api/minijeux/devinette/illustration/essai", { cookie, corps: { champion: "ogs-019-024" } });
    expect(ok.json).toMatchObject({ juste: true, gain: 14, etat: { reponse: { nom: "Master Yi", carte: { code: "ogs-005-024" } }, indice: { zoom: 1 } } });
  });

  it("tire le défi du jour au hasard, le fige, et ne reprend pas le champion de la veille", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    // 4 champions, celui d'hier est exclu : sur 20 tirages, jamais Ahri.
    for (let i = 0; i < 20; i++) {
      env.bd.prepare("DELETE FROM defis_du_jour").run();
      fixerDefi(env, "classique", "ogn-255-298", jourPrecedent(aujourdhui()));
      expect((await env.appeler("GET", "/api/minijeux/devinette/classique", { cookie })).statut).toBe(200);
      const tire = env.bd.prepare("SELECT reponse FROM defis_du_jour WHERE jour = ? AND mode = 'classique'").get(aujourdhui()) as { reponse: string };
      expect(["ogn-251-298", "ogs-019-024", "sfd-193-221"]).toContain(tire.reponse);
      await env.appeler("GET", "/api/minijeux/devinette/classique", { cookie });
      expect(env.bd.prepare("SELECT reponse FROM defis_du_jour WHERE jour = ? AND mode = 'classique'").get(aujourdhui())).toEqual(tire);
    }
    const hier = (await env.appeler("GET", "/api/minijeux/devinette/classique", { cookie })).json.hier;
    expect(hier).toMatchObject({ nom: "Ahri" });
  });

  it("refuse les visiteurs et les modes inconnus", async () => {
    const env = creerEnvironnementDeTest();
    expect((await env.appeler("GET", "/api/minijeux/devinette/classique")).statut).toBe(401);
    const cookie = await env.inscrire("Alice", "motdepasse");
    expect((await env.appeler("GET", "/api/minijeux/devinette/emoji", { cookie })).statut).toBe(400);
    expect((await env.appeler("POST", "/api/minijeux/devinette/classique/essai", { cookie, corps: { champion: "ogn-255-298", gain: 999 } })).statut).toBe(400);
  });
});

describe("API Memory", () => {
  const grille = (env: Env, id: number) =>
    JSON.parse((env.bd.prepare("SELECT grille FROM parties_memory WHERE id = ?").get(id) as { grille: string }).grille) as string[];

  /** Joue une partie parfaite (8 coups) en lisant la grille en base. */
  async function partieParfaite(env: Env, cookie: string) {
    const r = await env.appeler("POST", "/api/minijeux/memory", { cookie, corps: {} });
    expect(r.statut).toBe(201);
    const id = r.json.id as number;
    const g = grille(env, id);
    const vues = new Set<number>();
    let derniere: Record<string, unknown> = {};
    for (let a = 0; a < g.length; a++) {
      if (vues.has(a)) continue;
      const b = g.findIndex((code, i) => i !== a && code === g[a]);
      vues.add(a).add(b);
      await env.appeler("POST", `/api/minijeux/memory/${id}/retourner`, { cookie, corps: { position: a } });
      derniere = (await env.appeler("POST", `/api/minijeux/memory/${id}/retourner`, { cookie, corps: { position: b } })).json;
    }
    return derniere;
  }

  it("une grille de 8 paires, sans rune, avec mes cartes d'abord", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idDe(env, "Alice");
    for (const code of ["ogn-100-298", "ogn-110-298", "ogn-rune0"]) {
      env.bd.prepare("INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, ?, 0, 1)").run(id, code);
    }
    const r = await env.appeler("POST", "/api/minijeux/memory", { cookie, corps: {} });
    const g = grille(env, r.json.id as number);
    expect(g).toHaveLength(16);
    expect(new Set(g).size).toBe(8);
    for (const code of new Set(g)) expect(g.filter((x) => x === code)).toHaveLength(2);
    expect(g).toContain("ogn-100-298");
    expect(g).toContain("ogn-110-298");
    expect(g).not.toContain("ogn-rune0");
  });

  it("partie parfaite : 10 éclats, puis plafond de 30 par jour", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idDe(env, "Alice");
    expect(await partieParfaite(env, cookie)).toMatchObject({ paire: true, coups: 8, terminee: true, gain: 10, solde: 10 });
    await partieParfaite(env, cookie);
    await partieParfaite(env, cookie);
    expect(await partieParfaite(env, cookie)).toMatchObject({ terminee: true, gain: 0, solde: 30 });
    expect(solde(env, id)).toBe(30);
    expect((await env.appeler("GET", "/api/minijeux", { cookie })).json).toMatchObject({ memory: { gainsDuJour: 30, plafond: 30, parties: 4 } });
  });

  it("coups ratés, cases déjà retournées, partie d'un autre joueur", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const autre = await env.inscrire("Bob", "motdepasse");
    const r = await env.appeler("POST", "/api/minijeux/memory", { cookie, corps: {} });
    const id = r.json.id as number;
    const g = grille(env, id);
    const b = g.findIndex((code) => code !== g[0]);
    const retourner = (position: number, c = cookie) => env.appeler("POST", `/api/minijeux/memory/${id}/retourner`, { cookie: c, corps: { position } });

    expect((await retourner(0, autre)).statut).toBe(404);
    const premiere = await retourner(0);
    expect(premiere.json).toMatchObject({ position: 0, carte: { code: g[0] }, coups: 0 });
    expect((await retourner(0)).json).toEqual({ erreur: "case_deja_retournee" });
    expect((await retourner(b)).json).toMatchObject({ paire: false, coups: 1, terminee: false, premiere: { position: 0 } });
    expect((await retourner(16)).statut).toBe(400);

    // Une paire trouvée ne se retourne plus.
    const paire = g.findIndex((code, i) => i !== 0 && code === g[0]);
    await retourner(0);
    expect((await retourner(paire)).json).toMatchObject({ paire: true, coups: 2 });
    expect((await retourner(paire)).json).toEqual({ erreur: "case_deja_retournee" });

    // Nouvelle partie : l'ancienne, non terminée, disparaît.
    await env.appeler("POST", "/api/minijeux/memory", { cookie, corps: {} });
    expect((await retourner(3)).statut).toBe(404);
  });
});
