/** Tests du marché : annonces « Qui a ? / Qui veut ? », salon, messages privés, non lus, modération, anti-spam. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { amorcerCataloguePourTest, viderCacheMemoire } from "../catalogue/source-cartes";
import { MAX_ANNONCES_ACTIVES } from "../marche/routes-marche";
import { catalogueDeTest } from "./outils/catalogue-de-test";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

type Env = ReturnType<typeof creerEnvironnementDeTest>;
type Annonce = { id: number; type: string; auteur: string; estMoi: boolean; jePossede: number; carte: { code: string } | null };
type Message = { id: number; auteur: string; texte: string; estMoi: boolean; peutSupprimer: boolean; annonce: { type: string; active: boolean; carte: { code: string } | null } | null };

beforeEach(() => {
  viderCacheMemoire();
  amorcerCataloguePourTest(catalogueDeTest());
});
afterEach(() => vi.useRealTimers());

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

const annonces = async (env: Env, cookie: string) =>
  (await env.appeler("GET", "/api/marche/annonces", { cookie })).json.annonces as Annonce[];
const salon = async (env: Env, cookie: string, apres?: number) =>
  (await env.appeler("GET", `/api/marche/salon${apres !== undefined ? `?apres=${apres}` : ""}`, { cookie })).json.messages as Message[];

describe("Annonces du marché", () => {
  it("« Qui a ? » : visible par tous, publiée dans le salon avec la carte, et indique si je l'ai", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    donner(env, "Bob", "ogn-c0", 2);
    const r = await env.appeler("POST", "/api/marche/annonces", { cookie: alice, corps: { type: "cherche", code: "ogn-c0", foil: false, note: "pour mon deck" } });
    expect(r.statut).toBe(201);

    const vues = await annonces(env, bob);
    expect(vues).toHaveLength(1);
    expect(vues[0]).toMatchObject({ type: "cherche", auteur: "Alice", estMoi: false, jePossede: 2 });
    expect(vues[0]?.carte?.code).toBe("ogn-c0");

    const messages = await salon(env, bob);
    expect(messages[0]?.texte).toBe("pour mon deck");
    expect(messages[0]?.annonce).toMatchObject({ type: "cherche", active: true });
    expect(messages[0]?.annonce?.carte?.code).toBe("ogn-c0");
  });

  it("« Qui veut ? » : seulement une carte possédée, et masquée quand l'auteur ne l'a plus", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    const refus = await env.appeler("POST", "/api/marche/annonces", { cookie: alice, corps: { type: "propose", code: "ogn-c0", foil: false } });
    expect(refus.statut).toBe(409);
    expect(refus.json.erreur).toBe("cartes_non_possedees");

    donner(env, "Alice", "ogn-c0", 1);
    expect((await env.appeler("POST", "/api/marche/annonces", { cookie: alice, corps: { type: "propose", code: "ogn-c0", foil: false } })).statut).toBe(201);
    expect(await annonces(env, bob)).toHaveLength(1);

    env.bd.prepare("DELETE FROM collection WHERE compte_id = ?").run(id(env, "Alice"));
    expect(await annonces(env, bob)).toHaveLength(0);
  });

  it("refuse une carte inconnue, un doublon, et au-delà du maximum d'annonces actives", async () => {
    const { env, alice } = await deuxJoueurs();
    expect((await env.appeler("POST", "/api/marche/annonces", { cookie: alice, corps: { type: "cherche", code: "zzz-999", foil: false } })).statut).toBe(404);
    const corps = { type: "cherche", code: "ogn-c0", foil: false };
    expect((await env.appeler("POST", "/api/marche/annonces", { cookie: alice, corps })).statut).toBe(201);
    expect((await env.appeler("POST", "/api/marche/annonces", { cookie: alice, corps })).json.erreur).toBe("annonce_en_double");

    const maintenant = Date.now();
    const inserer = env.bd.prepare("INSERT INTO annonces (compte_id, type, card_code, est_foil, cree_le, expire_le) VALUES (?, 'cherche', ?, 0, ?, ?)");
    for (let i = 1; i < MAX_ANNONCES_ACTIVES; i++) inserer.run(id(env, "Alice"), `ogn-c${i}`, maintenant, maintenant + 1e9);
    const trop = await env.appeler("POST", "/api/marche/annonces", { cookie: alice, corps: { type: "cherche", code: "ogn-u0", foil: false } });
    expect(trop.json.erreur).toBe("trop_d_annonces");
  });

  it("seul l'auteur (ou un admin avec accès ouvert) peut retirer une annonce", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    const { json } = await env.appeler("POST", "/api/marche/annonces", { cookie: alice, corps: { type: "cherche", code: "ogn-c0", foil: false } });
    expect((await env.appeler("DELETE", `/api/marche/annonces/${json.id}`, { cookie: bob })).statut).toBe(404);
    expect((await env.appeler("DELETE", `/api/marche/annonces/${json.id}`, { cookie: alice })).statut).toBe(200);
    expect(await annonces(env, bob)).toHaveLength(0);
    // Le message du salon reste, marqué comme annonce inactive.
    expect((await salon(env, bob))[0]?.annonce?.active).toBe(false);
  });

  it("une annonce expire au bout de 30 jours", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { env, alice } = await deuxJoueurs();
    await env.appeler("POST", "/api/marche/annonces", { cookie: alice, corps: { type: "cherche", code: "ogn-c0", foil: false } });
    vi.setSystemTime(Date.now() + 30 * 24 * 60 * 60_000 + 1);
    // Les sessions durent moins de 30 jours : Bob se reconnecte.
    const bob = (await env.appeler("POST", "/api/auth/connexion", { corps: { pseudo: "Bob", motDePasse: "mot-de-passe-bob" } })).cookie;
    expect(bob).toBeTruthy();
    expect(await annonces(env, bob as string)).toHaveLength(0);
  });
});

describe("Salon et messages privés", () => {
  it("salon : messages visibles par tous, rafraîchissement par « apres », non lus remis à zéro à la lecture", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    const premier = await env.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: "Salut !" } });
    expect(premier.statut).toBe(201);
    expect((await env.appeler("GET", "/api/marche/non-lus", { cookie: bob })).json).toEqual({ salon: 1, prive: 0 });
    expect((await env.appeler("GET", "/api/marche/non-lus", { cookie: alice })).json.salon).toBe(0); // mes propres messages

    const vus = await salon(env, bob);
    expect(vus.map((m) => m.texte)).toEqual(["Salut !"]);
    expect((await env.appeler("GET", "/api/marche/non-lus", { cookie: bob })).json.salon).toBe(0);

    await env.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: "Ça va ?" } });
    expect((await salon(env, bob, premier.json.id as number)).map((m) => m.texte)).toEqual(["Ça va ?"]);
  });

  it("privé : seuls les deux joueurs voient la conversation", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    const carol = await env.inscrire("Carol", "mot-de-passe-carol");
    expect((await env.appeler("POST", "/api/marche/prive/Bob", { cookie: alice, corps: { texte: "Tu échanges ton Jinx ?" } })).statut).toBe(201);

    expect((await env.appeler("GET", "/api/marche/non-lus", { cookie: bob })).json.prive).toBe(1);
    const conversations = (await env.appeler("GET", "/api/marche/conversations", { cookie: bob })).json.conversations as Array<{ avec: string; nonLus: number }>;
    expect(conversations).toEqual([expect.objectContaining({ avec: "Alice", nonLus: 1, dernierMessage: "Tu échanges ton Jinx ?" })]);

    const lus = (await env.appeler("GET", "/api/marche/prive/Alice", { cookie: bob })).json.messages as Message[];
    expect(lus.map((m) => m.texte)).toEqual(["Tu échanges ton Jinx ?"]);
    expect((await env.appeler("GET", "/api/marche/non-lus", { cookie: bob })).json.prive).toBe(0);

    // Carol ne voit rien de cette conversation, ni dans le salon.
    expect((await env.appeler("GET", "/api/marche/conversations", { cookie: carol })).json.conversations).toEqual([]);
    expect(await salon(env, carol)).toEqual([]);
  });

  it("refuse un message vide, trop long, à soi-même ou à un joueur inconnu", async () => {
    const { env, alice } = await deuxJoueurs();
    expect((await env.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: "   " } })).statut).toBe(400);
    expect((await env.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: "x".repeat(501) } })).statut).toBe(400);
    expect((await env.appeler("POST", "/api/marche/prive/Alice", { cookie: alice, corps: { texte: "moi" } })).statut).toBe(404);
    expect((await env.appeler("POST", "/api/marche/prive/Personne", { cookie: alice, corps: { texte: "?" } })).statut).toBe(404);
  });

  it("le texte est stocké tel quel (pas d'interprétation HTML côté serveur)", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    await env.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: "<img src=x onerror=alert(1)>" } });
    expect((await salon(env, bob))[0]?.texte).toBe("<img src=x onerror=alert(1)>");
  });

  it("anti-spam : au-delà de 20 messages par minute, refus 429", async () => {
    const { env, alice } = await deuxJoueurs();
    for (let i = 0; i < 20; i++) {
      expect((await env.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: `m${i}` } })).statut).toBe(201);
    }
    const r = await env.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: "encore" } });
    expect(r.statut).toBe(429);
    expect(r.json.erreur).toBe("trop_de_messages");
  });

  it("suppression : par l'auteur, pas par un autre joueur ; par un admin seulement avec l'accès admin ouvert", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    const admin = await env.inscrire("Crousti", "mot-de-passe-admin", "admin");
    const m1 = (await env.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: "un" } })).json.id;
    const m2 = (await env.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: "deux" } })).json.id;

    expect((await env.appeler("DELETE", `/api/marche/messages/${m1}`, { cookie: bob })).statut).toBe(404);
    expect((await env.appeler("DELETE", `/api/marche/messages/${m1}`, { cookie: alice })).statut).toBe(200);

    expect((await env.appeler("DELETE", `/api/marche/messages/${m2}`, { cookie: admin })).statut).toBe(404);
    await env.appeler("POST", "/api/admin/elevation", { cookie: admin, corps: { motDePasse: "mot-de-passe-admin" } });
    expect((await env.appeler("DELETE", `/api/marche/messages/${m2}`, { cookie: admin })).statut).toBe(200);
    expect(await salon(env, bob)).toEqual([]);
  });

  it("un visiteur non connecté n'a accès à rien", async () => {
    const env = creerEnvironnementDeTest();
    expect((await env.appeler("GET", "/api/marche/salon")).statut).toBe(401);
    expect((await env.appeler("GET", "/api/marche/annonces")).statut).toBe(401);
  });
});
