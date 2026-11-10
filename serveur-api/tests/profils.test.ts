/** Tests des profils : avatar (carte possédée), bio (texte brut), vitrine de 6 cartes, statistiques, modération. */
import { beforeEach, describe, expect, it } from "vitest";
import { amorcerCataloguePourTest, viderCacheMemoire } from "../catalogue/source-cartes";
import { catalogueDeTest } from "./outils/catalogue-de-test";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

type Env = ReturnType<typeof creerEnvironnementDeTest>;
interface Profil {
  pseudo: string;
  estMoi: boolean;
  peutModerer: boolean;
  bio: string;
  avatar: { code: string } | null;
  vitrine: Array<{ carte: { code: string }; foil: boolean }>;
  statistiques: { totalCartes: number; cartesDistinctes: number; boostersOuverts: number; echangesReussis: number; completion: Array<{ code: string; possedees: number }> };
}

beforeEach(() => {
  viderCacheMemoire();
  amorcerCataloguePourTest(catalogueDeTest());
});

function id(env: Env, pseudo: string): number {
  return (env.bd.prepare("SELECT id FROM comptes WHERE pseudo = ?").get(pseudo) as { id: number }).id;
}

function donner(env: Env, pseudo: string, code: string, quantite: number, foil: 0 | 1 = 0): void {
  env.bd
    .prepare("INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, ?, ?, ?)")
    .run(id(env, pseudo), code, foil, quantite);
}

async function deuxJoueurs() {
  const env = creerEnvironnementDeTest();
  const alice = await env.inscrire("Alice", "mot-de-passe-alice");
  const bob = await env.inscrire("Bob", "mot-de-passe-bob");
  return { env, alice, bob };
}

const profil = async (env: Env, cookie: string, pseudo: string) =>
  (await env.appeler("GET", `/api/profils/joueur/${pseudo}`, { cookie })).json as unknown as Profil;
const enregistrer = (env: Env, cookie: string, corps: unknown) => env.appeler("POST", "/api/profils", { cookie, corps });

describe("Profil d'un joueur", () => {
  it("exige d'être connecté et renvoie 404 pour un joueur inconnu", async () => {
    const { env, alice } = await deuxJoueurs();
    expect((await env.appeler("GET", "/api/profils/joueur/Alice")).statut).toBe(401);
    expect((await env.appeler("GET", "/api/profils/joueur/Personne", { cookie: alice })).statut).toBe(404);
    expect((await env.appeler("GET", "/api/profils/joueur/<script>", { cookie: alice })).statut).toBe(404);
  });

  it("profil vide par défaut, avec les statistiques de collection", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    donner(env, "Bob", "ogn-c0", 3);
    donner(env, "Bob", "ogn-c0", 1, 1);
    donner(env, "Bob", "ogn-alt0", 1);
    const p = await profil(env, alice, "Bob");
    expect(p).toMatchObject({ pseudo: "Bob", estMoi: false, bio: "", avatar: null, vitrine: [] });
    expect(p.statistiques).toMatchObject({ totalCartes: 5, cartesDistinctes: 2, boostersOuverts: 0, echangesReussis: 0 });
    // Complétion : seulement les cartes de base (l'alt art ne compte pas), normale et foil comptées une fois.
    expect(p.statistiques.completion.find((s) => s.code === "ogn")?.possedees).toBe(1);
    expect((await profil(env, bob, "bob")).estMoi).toBe(true); // pseudo insensible à la casse
  });

  it("enregistre bio, avatar et vitrine dans l'ordre, visibles par les autres", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    donner(env, "Alice", "ogn-e0", 1);
    donner(env, "Alice", "ogn-alt0", 1, 1);
    donner(env, "Alice", "ogn-c0", 2);
    const r = await enregistrer(env, alice, {
      bio: "  Collectionneuse\r\nd'Epic  ",
      avatar: "ogn-alt0",
      vitrine: [
        { code: "ogn-alt0", foil: true },
        { code: "ogn-e0", foil: false },
        { code: "ogn-c0", foil: false },
      ],
    });
    expect(r.statut).toBe(200);

    const p = await profil(env, bob, "Alice");
    expect(p.bio).toBe("Collectionneuse\nd'Epic");
    expect(p.avatar?.code).toBe("ogn-alt0");
    expect(p.vitrine.map((v) => `${v.carte.code}:${v.foil}`)).toEqual(["ogn-alt0:true", "ogn-e0:false", "ogn-c0:false"]);

    // Remplacement complet : la nouvelle vitrine remplace l'ancienne.
    await enregistrer(env, alice, { bio: "", avatar: null, vitrine: [{ code: "ogn-c0", foil: false }] });
    const p2 = await profil(env, bob, "Alice");
    expect(p2).toMatchObject({ bio: "", avatar: null });
    expect(p2.vitrine).toHaveLength(1);

    const avatar = await env.appeler("GET", "/api/profils/avatar", { cookie: alice });
    expect(avatar.json.avatar).toBeNull();
  });

  it("refuse une carte non possédée (avatar ou vitrine, foil distinct) et une carte inconnue", async () => {
    const { env, alice } = await deuxJoueurs();
    donner(env, "Alice", "ogn-c0", 1);
    const vide = { bio: "", avatar: null, vitrine: [] };
    expect((await enregistrer(env, alice, { ...vide, avatar: "ogn-e0" })).json.erreur).toBe("cartes_non_possedees");
    expect((await enregistrer(env, alice, { ...vide, vitrine: [{ code: "ogn-c0", foil: true }] })).json.erreur).toBe("cartes_non_possedees");
    expect((await enregistrer(env, alice, { ...vide, avatar: "zzz-999" })).statut).toBe(404);
    expect(env.bd.prepare("SELECT COUNT(*) AS n FROM vitrine").get()).toEqual({ n: 0 });
  });

  it("valide la vitrine (6 maximum, pas de doublon) et la bio (200 caractères, texte brut)", async () => {
    const { env, alice } = await deuxJoueurs();
    for (let i = 0; i < 7; i++) donner(env, "Alice", `ogn-c${i}`, 1);
    const sept = Array.from({ length: 7 }, (_, i) => ({ code: `ogn-c${i}`, foil: false }));
    expect((await enregistrer(env, alice, { bio: "", avatar: null, vitrine: sept })).statut).toBe(400);
    expect((await enregistrer(env, alice, { bio: "", avatar: null, vitrine: sept.slice(0, 6) })).statut).toBe(200);
    const doublon = [sept[0], sept[0]];
    expect((await enregistrer(env, alice, { bio: "", avatar: null, vitrine: doublon })).statut).toBe(400);

    expect((await enregistrer(env, alice, { bio: "x".repeat(201), avatar: null, vitrine: [] })).statut).toBe(400);
    expect((await enregistrer(env, alice, { bio: "bip\u0007", avatar: null, vitrine: [] })).statut).toBe(400);
    expect((await enregistrer(env, alice, { bio: "a", avatar: null, vitrine: [], role: "admin" })).statut).toBe(400);

    // Le HTML reste du texte ; les caractères d'inversion d'écriture sont retirés ; 3 sauts de ligne → 2.
    await enregistrer(env, alice, { bio: "<b>salut</b>‮txt.exe\n\n\n\nfin", avatar: null, vitrine: [] });
    expect((await profil(env, alice, "Alice")).bio).toBe("<b>salut</b>txt.exe\n\nfin");
  });

  it("une carte échangée disparaît de la vitrine ; l'avatar, lui, reste", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    donner(env, "Alice", "ogn-e0", 1);
    donner(env, "Alice", "ogn-c0", 1);
    await enregistrer(env, alice, {
      bio: "",
      avatar: "ogn-e0",
      vitrine: [
        { code: "ogn-e0", foil: false },
        { code: "ogn-c0", foil: false },
      ],
    });
    env.bd.prepare("DELETE FROM collection WHERE compte_id = ? AND card_code = 'ogn-e0'").run(id(env, "Alice"));

    const p = await profil(env, bob, "Alice");
    expect(p.vitrine.map((v) => v.carte.code)).toEqual(["ogn-c0"]);
    expect(p.avatar?.code).toBe("ogn-e0");
    // On peut ré-enregistrer son profil en gardant cet avatar, mais pas en choisir un autre qu'on n'a pas.
    expect((await enregistrer(env, alice, { bio: "ok", avatar: "ogn-e0", vitrine: [] })).statut).toBe(200);
    expect((await enregistrer(env, alice, { bio: "ok", avatar: "ogn-e1", vitrine: [] })).statut).toBe(409);
  });

  it("l'avatar apparaît à côté des messages et des annonces du marché", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    donner(env, "Alice", "ogn-e0", 1);
    await enregistrer(env, alice, { bio: "", avatar: "ogn-e0", vitrine: [] });
    await env.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: "coucou" } });
    await env.appeler("POST", "/api/marche/annonces", { cookie: alice, corps: { type: "cherche", code: "ogn-c1", foil: false } });
    await env.appeler("POST", "/api/marche/prive/Bob", { cookie: alice, corps: { texte: "salut Bob" } });

    const messages = (await env.appeler("GET", "/api/marche/salon", { cookie: bob })).json.messages as Array<{ auteurAvatar: unknown }>;
    expect(messages[0]?.auteurAvatar).toMatchObject({ image: expect.stringContaining("cmsassets.rgpub.io") });
    const annonces = (await env.appeler("GET", "/api/marche/annonces", { cookie: bob })).json.annonces as Array<{ auteurAvatar: unknown }>;
    expect(annonces[0]?.auteurAvatar).not.toBeNull();
    const conversations = (await env.appeler("GET", "/api/marche/conversations", { cookie: bob })).json.conversations as Array<{ avecAvatar: unknown }>;
    expect(conversations[0]?.avecAvatar).not.toBeNull();
  });

  it("limite le nombre d'enregistrements (30 par heure)", async () => {
    const { env, alice } = await deuxJoueurs();
    const vide = { bio: "", avatar: null, vitrine: [] };
    const reponses = await Promise.all(Array.from({ length: 32 }, () => enregistrer(env, alice, vide)));
    expect(reponses.filter((r) => r.statut === 200)).toHaveLength(30);
    expect(reponses.filter((r) => r.statut === 429)).toHaveLength(2);
  });

  it("affiche la wishlist (cartes pas encore obtenues) avec ce que le visiteur en possède", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    for (const code of ["ogn-e0", "ogn-alt0", "ogn-c3"]) await env.appeler("POST", "/api/wishlist", { cookie: alice, corps: { code } });
    donner(env, "Alice", "ogn-c3", 1); // obtenue : n'est plus affichée
    donner(env, "Bob", "ogn-e0", 2);
    const vue = (await env.appeler("GET", "/api/profils/joueur/Alice", { cookie: bob })).json.wishlist as Array<{ carte: { code: string }; jePossede: number }>;
    expect(vue.map((w) => [w.carte.code, w.jePossede])).toEqual([
      ["ogn-alt0", 0],
      ["ogn-e0", 2],
    ]);
  });

  it("modération : seul un admin dont l'accès est ouvert peut effacer une bio (journalisé)", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    await enregistrer(env, alice, { bio: "bio à modérer", avatar: null, vitrine: [] });
    expect((await env.appeler("DELETE", "/api/profils/joueur/Alice/bio", { cookie: bob })).statut).toBe(403);

    env.bd.prepare("UPDATE comptes SET role = 'admin' WHERE pseudo = 'Bob'").run();
    expect((await env.appeler("DELETE", "/api/profils/joueur/Alice/bio", { cookie: bob })).statut).toBe(403); // accès admin fermé
    env.bd.prepare("UPDATE sessions SET admin_jusqua = ? WHERE compte_id = ?").run(Date.now() + 600_000, id(env, "Bob"));

    expect((await profil(env, bob, "Alice")).peutModerer).toBe(true);
    expect((await env.appeler("DELETE", "/api/profils/joueur/Alice/bio", { cookie: bob })).statut).toBe(200);
    expect((await profil(env, bob, "Alice")).bio).toBe("");
    expect(env.bd.prepare("SELECT COUNT(*) AS n FROM journal WHERE type = 'bio_effacee'").get()).toEqual({ n: 1 });
  });
});
