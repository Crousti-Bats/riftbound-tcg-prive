/** Mini-jeux : « Devine le champion » (classique, emoji, capacité, illustration) et Memory, avec leurs gains en éclats. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { amorcerCataloguePourTest, viderCacheMemoire } from "../catalogue/source-cartes";
import type { CarteCatalogue, Catalogue } from "../catalogue/types-catalogue";
import { CHAMPIONS_LOL, championLol, championLolDuNom } from "../minijeux/champions-lol";
import {
  centreDuZoom,
  championsRiftbound,
  comparer,
  emojisVisibles,
  gainDevinette,
  gainMemory,
  jourDeParis,
  jourPrecedent,
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

const legende = (code: string, set: string, champion: string, texte: string) =>
  carte({ code, set, nom: `Légende ${champion}`, type: "Legend", tags: [champion], texte });
const unite = (code: string, set: string, champion: string) => carte({ code, set, nom: champion, etiquettes: ["Champion"], tags: [champion] });

/** 4 champions Riftbound (dont Master Yi avec 2 Légendes) et 10 cartes ordinaires pour le Memory. */
function catalogueMiniJeux(): Catalogue {
  const cartes: CarteCatalogue[] = [
    legende("ogn-255-298", "ogn", "Ahri", "Quand Ahri attaque, pioche 1."),
    unite("ogn-066-298", "ogn", "Ahri"),
    legende("ogn-251-298", "ogn", "Jinx", "Défausse 1 : pioche 2."),
    unite("ogn-030-298", "ogn", "Jinx"),
    legende("unl-191-219", "unl", "Master Yi", "Master Yi frappe deux fois."),
    legende("ogs-019-024", "ogs", "Master Yi", "Alpha."),
    unite("ogs-005-024", "ogs", "Master Yi"),
    legende("sfd-193-221", "sfd", "Jax", "Jax se défend."),
    unite("sfd-050-221", "sfd", "Jax"),
    // Unité champion sans Légende : pas de mode capacité ni illustration pour lui.
    unite("ogn-099-298", "ogn", "Graves"),
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
const lol = (id: string) => {
  const ch = championLol(id);
  if (!ch) throw new Error(`champion ${id} absent de la table`);
  return ch;
};

describe("Règles des mini-jeux", () => {
  it("table des champions LoL : complète, sans doublon, 5 emojis chacun", () => {
    expect(CHAMPIONS_LOL.length).toBeGreaterThanOrEqual(170);
    expect(new Set(CHAMPIONS_LOL.map((c) => c.id)).size).toBe(CHAMPIONS_LOL.length);
    for (const c of CHAMPIONS_LOL) {
      expect(c.emojis, c.id).toHaveLength(5);
      expect(c.postes.length, c.id).toBeGreaterThan(0);
      expect(c.regions.length, c.id).toBeGreaterThan(0);
      expect(c.annee, c.id).toBeGreaterThanOrEqual(2009);
      expect(["Masculin", "Féminin", "Autre"], c.id).toContain(c.genre);
    }
    expect(lol("XinZhao")).toMatchObject({ nom: "Xin Zhao", regions: ["Demacia", "Ionia", "Noxus"], postes: ["Jungle"], annee: 2010 });
    expect(lol("XinZhao").image).toMatch(/^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/[\d.]+\/img\/champion\/XinZhao\.png$/);
    // Noms anglais des cartes Riftbound → fiche LoL.
    expect(["Kai'Sa", "Master Yi", "K'Sante", "Renata Glasc", "Jarvan IV", "Dr. Mundo"].map((n) => championLolDuNom(n)?.id)).toEqual([
      "Kaisa",
      "MasterYi",
      "KSante",
      "Renata",
      "JarvanIV",
      "DrMundo",
    ]);
  });

  it("champions Riftbound : ceux qui ont une Légende, reliés à leur fiche LoL", () => {
    const champions = championsRiftbound(catalogue);
    expect(champions.map((c) => c.lol.id)).toEqual(["Ahri", "Jax", "Jinx", "MasterYi"]);
    const yi = champions.find((c) => c.lol.id === "MasterYi");
    expect(yi?.legendes.map((l) => l.code)).toEqual(["ogs-019-024", "unl-191-219"]);
    expect(yi?.illustrations.map((l) => l.code)).toContain("ogs-005-024");
  });

  it("comparaison façon Loldle : vert, orange, rouge et flèche sur l'année", () => {
    const c = comparer(lol("Garen"), lol("XinZhao"));
    expect(c.genre.etat).toBe("juste");
    expect(c.postes.etat).toBe("faux");
    expect(c.especes.etat).toBe("juste");
    expect(c.ressource.etat).toBe("faux");
    expect(c.portee.etat).toBe("juste");
    expect(c.regions).toMatchObject({ valeur: ["Demacia"], etat: "partiel" });
    expect(c.annee).toMatchObject({ valeur: 2010, etat: "juste", sens: null });
    expect(comparer(lol("Ahri"), lol("XinZhao")).annee).toMatchObject({ etat: "faux", sens: "moins" });
    expect(comparer(lol("Alistar"), lol("XinZhao")).annee).toMatchObject({ sens: "plus" });
    expect(comparer(lol("Jayce"), lol("Ahri")).portee.etat).toBe("partiel"); // Mêlée et Distance
  });

  it("gains, emojis, zoom, texte masqué et jours (minuit à Paris)", () => {
    expect([1, 2, 5, 11, 50].map((n) => gainDevinette("classique", n))).toEqual([30, 28, 22, 10, 10]);
    expect([1, 3, 20].map((n) => gainDevinette("emoji", n))).toEqual([15, 13, 5]);
    expect([8, 12, 13, 16, 17, 40].map(gainMemory)).toEqual([10, 10, 6, 6, 3, 3]);
    const xin = lol("XinZhao");
    expect(emojisVisibles(xin, 0, false)).toHaveLength(1);
    expect(emojisVisibles(xin, 3, false)).toHaveLength(4);
    expect(emojisVisibles(xin, 30, false)).toHaveLength(5);
    expect(emojisVisibles(xin, 0, true)).toHaveLength(5);
    expect([0, 2, 8, 20].map((e) => zoomIllustration(e, false))).toEqual([5, 4, 1, 1]);
    expect(zoomIllustration(0, true)).toBe(1);
    expect(centreDuZoom("2026-11-13", "ogn-255-298")).toEqual(centreDuZoom("2026-11-13", "ogn-255-298"));
    const yi = championsRiftbound(catalogue).find((c) => c.lol.id === "MasterYi");
    if (!yi?.legendes[1]) throw new Error("catalogue");
    expect(texteMasque(yi.legendes[1], yi)).toBe("??? frappe deux fois.");
    expect(jourDeParis(Date.parse("2026-11-12T23:30:00Z"))).toBe("2026-11-13"); // heure d'hiver : UTC+1
    expect(jourDeParis(Date.parse("2026-07-01T21:59:00Z"))).toBe("2026-07-01"); // heure d'été : UTC+2
    expect(jourPrecedent("2026-03-01")).toBe("2026-02-28");
  });
});

describe("API « Devine le champion »", () => {
  it("classique : n'importe quel champion de LoL, comparé colonne par colonne ; gain crédité une seule fois", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const id = idDe(env, "Alice");
    fixerDefi(env, "classique", "XinZhao");
    const essayer = (champion: string) => env.appeler("POST", "/api/minijeux/devinette/classique/essai", { cookie, corps: { champion } });

    const liste = (await env.appeler("GET", "/api/minijeux/champions", { cookie })).json.champions as Array<{ id: string }>;
    expect(liste.length).toBe(CHAMPIONS_LOL.length);

    const avant = await env.appeler("GET", "/api/minijeux/devinette/classique", { cookie });
    expect(avant.json).toMatchObject({ essais: [], trouve: false, gainPossible: 30, reponse: null, indice: null });

    const rate = await essayer("Garen");
    expect(rate.statut).toBe(200);
    expect(rate.json).toMatchObject({ juste: false, gain: 0, solde: 0, etat: { gainPossible: 28 } });
    const etat = rate.json.etat as { essais: Array<{ champion: { nom: string }; comparaison: { regions: { etat: string } } }> };
    expect(etat.essais[0]).toMatchObject({ champion: { nom: "Garen" }, comparaison: { regions: { etat: "partiel" } } });

    expect((await essayer("Garen")).json).toEqual({ erreur: "deja_propose" });
    expect((await essayer("Inconnu")).json).toEqual({ erreur: "champion_inconnu" });
    expect((await essayer("xin-zhao")).statut).toBe(400);

    const juste = await essayer("XinZhao");
    expect(juste.json).toMatchObject({ juste: true, gain: 28, solde: 28, etat: { trouve: true, reponse: { nom: "Xin Zhao", carte: null }, trouvesAujourdhui: 1 } });
    expect(solde(env, id)).toBe(28);
    expect((await essayer("Ahri")).json).toEqual({ erreur: "deja_trouve" });
    expect(solde(env, id)).toBe(28);

    const resume = await env.appeler("GET", "/api/minijeux", { cookie });
    expect(resume.json).toMatchObject({ devinette: { classique: { essais: 2, trouve: true, gain: 28 }, emoji: { essais: 0, trouve: false } } });
  });

  it("emoji : un emoji de plus à chaque erreur, tous une fois trouvé", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    fixerDefi(env, "emoji", "XinZhao");
    const debut = await env.appeler("GET", "/api/minijeux/devinette/emoji", { cookie });
    expect(debut.json.indice).toEqual({ emojis: lol("XinZhao").emojis.slice(0, 1), total: 5 });
    expect(debut.texte).not.toMatch(/XinZhao|Xin Zhao/);
    const r = await env.appeler("POST", "/api/minijeux/devinette/emoji/essai", { cookie, corps: { champion: "Ahri" } });
    expect((r.json.etat as { indice: { emojis: string[] } }).indice.emojis).toHaveLength(2);
    const ok = await env.appeler("POST", "/api/minijeux/devinette/emoji/essai", { cookie, corps: { champion: "XinZhao" } });
    expect(ok.json).toMatchObject({ juste: true, gain: 14, etat: { indice: { emojis: lol("XinZhao").emojis } } });
  });

  it("des bonnes réponses envoyées en même temps ne sont créditées qu'une fois", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    fixerDefi(env, "capacite", "ogn-251-298"); // Légende de Jinx
    const reponses = await Promise.all(
      Array.from({ length: 5 }, () => env.appeler("POST", "/api/minijeux/devinette/capacite/essai", { cookie, corps: { champion: "Jinx" } })),
    );
    expect(reponses.filter((r) => r.statut === 200)).toHaveLength(1);
    expect(solde(env, idDe(env, "Alice"))).toBe(15);
  });

  it("capacité et illustration : la réponse n'est jamais dévoilée avant d'être trouvée", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    fixerDefi(env, "capacite", "unl-191-219");
    fixerDefi(env, "illustration", "ogs-005-024");
    const capacite = await env.appeler("GET", "/api/minijeux/devinette/capacite", { cookie });
    expect(capacite.json.indice).toEqual({ texte: "??? frappe deux fois." });
    expect(capacite.texte).not.toMatch(/unl-191-219|Master Yi|Maître Yi|MasterYi/);

    const illustration = await env.appeler("GET", "/api/minijeux/devinette/illustration", { cookie });
    expect(illustration.json.indice).toMatchObject({ zoom: 5 });
    expect(illustration.texte).not.toMatch(/ogs-005-024|ogs-019-024|Master Yi|Maître Yi|MasterYi/);

    const appels: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      appels.push(url);
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/webp" } });
    });
    const image = await env.appeler("GET", "/api/minijeux/devinette/illustration/image", { cookie });
    expect(image.statut).toBe(200);
    expect(appels).toEqual(["https://cmsassets.rgpub.io/ogs-005-024.png?w=744&fm=webp"]);

    // Chaque erreur dézoome l'illustration ; on peut proposer un champion qui n'est pas dans Riftbound.
    const r = await env.appeler("POST", "/api/minijeux/devinette/illustration/essai", { cookie, corps: { champion: "Zyra" } });
    expect(r.json).toMatchObject({ juste: false, etat: { indice: { zoom: 4.5 } } });
    const ok = await env.appeler("POST", "/api/minijeux/devinette/illustration/essai", { cookie, corps: { champion: "MasterYi" } });
    expect(ok.json).toMatchObject({ juste: true, gain: 14, etat: { reponse: { nom: "Maître Yi", carte: { code: "ogs-005-024" } }, indice: { zoom: 1 } } });
  });

  it("tire le défi du jour au hasard, le fige, et ne reprend pas le champion de la veille", async () => {
    const env = creerEnvironnementDeTest();
    const cookie = await env.inscrire("Alice", "motdepasse");
    const tire = (mode: string) =>
      (env.bd.prepare("SELECT reponse FROM defis_du_jour WHERE jour = ? AND mode = ?").get(aujourdhui(), mode) as { reponse: string }).reponse;
    for (let i = 0; i < 20; i++) {
      env.bd.prepare("DELETE FROM defis_du_jour").run();
      fixerDefi(env, "classique", "Ahri", jourPrecedent(aujourdhui()));
      fixerDefi(env, "capacite", "ogn-255-298", jourPrecedent(aujourdhui())); // Ahri hier aussi
      expect((await env.appeler("GET", "/api/minijeux/devinette/classique", { cookie })).statut).toBe(200);
      expect((await env.appeler("GET", "/api/minijeux/devinette/capacite", { cookie })).statut).toBe(200);
      const classique = tire("classique");
      expect(championLol(classique)).toBeDefined();
      expect(classique).not.toBe("Ahri");
      expect(["ogn-251-298", "ogs-019-024", "unl-191-219", "sfd-193-221"]).toContain(tire("capacite"));
      await env.appeler("GET", "/api/minijeux/devinette/classique", { cookie });
      expect(tire("classique")).toBe(classique);
    }
    expect((await env.appeler("GET", "/api/minijeux/devinette/classique", { cookie })).json.hier).toMatchObject({ nom: "Ahri" });
  });

  it("refuse les visiteurs, les modes inconnus et les champs en trop", async () => {
    const env = creerEnvironnementDeTest();
    expect((await env.appeler("GET", "/api/minijeux/devinette/classique")).statut).toBe(401);
    const cookie = await env.inscrire("Alice", "motdepasse");
    expect((await env.appeler("GET", "/api/minijeux/devinette/citation", { cookie })).statut).toBe(400);
    expect((await env.appeler("POST", "/api/minijeux/devinette/classique/essai", { cookie, corps: { champion: "Ahri", gain: 999 } })).statut).toBe(400);
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
