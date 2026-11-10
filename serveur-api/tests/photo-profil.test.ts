/** Photo de profil personnelle : envoi vérifié (vraie image, taille), affichage, priorité sur la carte, modération. */
import { beforeEach, describe, expect, it } from "vitest";
import { amorcerCataloguePourTest, viderCacheMemoire } from "../catalogue/source-cartes";
import { app } from "../point-entree-api";
import { TAILLE_MAX_PHOTO } from "../profils/avatar";
import { catalogueDeTest } from "./outils/catalogue-de-test";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

type Env = ReturnType<typeof creerEnvironnementDeTest>;

beforeEach(() => {
  viderCacheMemoire();
  amorcerCataloguePourTest(catalogueDeTest());
});

const b64 = (octets: number[] | Uint8Array) => Buffer.from(octets instanceof Uint8Array ? octets : Uint8Array.from(octets)).toString("base64");
// PNG 1 x 1 valide.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const WEBP = b64([...Buffer.from("RIFF"), 0x1a, 0, 0, 0, ...Buffer.from("WEBPVP8L"), 0x0d, 0, 0, 0, 0x2f, 0, 0, 0, 0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe, 0x07, 0]);
const SVG = b64([...Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')]);

async function deuxJoueurs() {
  const env = creerEnvironnementDeTest();
  const alice = await env.inscrire("Alice", "mot-de-passe-alice");
  const bob = await env.inscrire("Bob", "mot-de-passe-bob");
  return { env, alice, bob };
}
const envoyer = (env: Env, cookie: string, image: string) => env.appeler("POST", "/api/profils/photo", { cookie, corps: { image } });
const idDe = (env: Env, pseudo: string) => (env.bd.prepare("SELECT id FROM comptes WHERE pseudo = ?").get(pseudo) as { id: number }).id;

describe("Photo de profil", () => {
  it("accepte un PNG ou un WebP, la sert avec des en-têtes stricts, et elle prime sur l'avatar « carte »", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    env.bd.prepare("INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, 'ogn-e0', 0, 1)").run(idDe(env, "Alice"));
    await env.appeler("POST", "/api/profils", { cookie: alice, corps: { bio: "", avatar: "ogn-e0", vitrine: [] } });

    const r = await envoyer(env, alice, PNG);
    expect(r.statut).toBe(201);
    const adresse = r.json.photo as string;
    expect(adresse).toMatch(new RegExp(`^/api/profils/photo/${idDe(env, "Alice")}\\?v=\\d+$`));

    const profil = (await env.appeler("GET", "/api/profils/joueur/Alice", { cookie: bob })).json;
    expect(profil.photo).toBe(adresse);
    expect((profil.avatar as { code: string }).code).toBe("ogn-e0"); // la carte reste choisie, la photo passe devant
    expect((await env.appeler("GET", "/api/profils/avatar", { cookie: alice })).json.avatar).toMatchObject({ image: adresse, photo: true });

    const image = await app.request(adresse, { headers: { Cookie: `__Host-session=${bob}` } }, env.env);
    expect(image.status).toBe(200);
    expect(image.headers.get("Content-Type")).toBe("image/png");
    expect(image.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(image.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(image.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
    expect(image.headers.get("X-Frame-Options")).toBe("DENY");
    expect(Buffer.from(await image.arrayBuffer()).toString("base64")).toBe(PNG);
    expect((await app.request(adresse, {}, env.env)).status).toBe(401); // connexion obligatoire

    expect((await envoyer(env, alice, WEBP)).statut).toBe(201);
    expect(env.bd.prepare("SELECT type FROM photos_profil").get()).toEqual({ type: "image/webp" });
  });

  it("refuse ce qui n'est pas une vraie image JPEG/PNG/WebP, et une image trop lourde", async () => {
    const { env, alice } = await deuxJoueurs();
    expect((await envoyer(env, alice, SVG)).json.erreur).toBe("photo_invalide");
    expect((await envoyer(env, alice, b64([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0]))).json.erreur).toBe("photo_invalide"); // GIF
    expect((await envoyer(env, alice, "pas du base64 !!!")).json.erreur).toBe("photo_invalide");
    const tropGros = new Uint8Array(TAILLE_MAX_PHOTO + 10);
    tropGros.set([0xff, 0xd8, 0xff]);
    const reponse = await envoyer(env, alice, b64(tropGros));
    expect([400, 413]).toContain(reponse.statut);
    expect(env.bd.prepare("SELECT COUNT(*) AS n FROM photos_profil").get()).toEqual({ n: 0 });
  });

  it("retrait par le joueur ; modération par un admin (accès ouvert), journalisée", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    await envoyer(env, alice, PNG);
    expect((await env.appeler("DELETE", "/api/profils/joueur/Alice/photo", { cookie: bob })).statut).toBe(403);
    env.bd.prepare("UPDATE comptes SET role = 'admin' WHERE pseudo = 'Bob'").run();
    env.bd.prepare("UPDATE sessions SET admin_jusqua = ? WHERE compte_id = ?").run(Date.now() + 600_000, idDe(env, "Bob"));
    expect((await env.appeler("DELETE", "/api/profils/joueur/Alice/photo", { cookie: bob })).statut).toBe(200);
    expect((await env.appeler("GET", "/api/profils/joueur/Alice", { cookie: bob })).json.photo).toBeNull();
    expect(env.bd.prepare("SELECT COUNT(*) AS n FROM journal WHERE type = 'photo_retiree'").get()).toEqual({ n: 1 });

    await envoyer(env, alice, PNG);
    expect((await env.appeler("DELETE", "/api/profils/photo", { cookie: alice })).statut).toBe(200);
    expect(env.bd.prepare("SELECT COUNT(*) AS n FROM photos_profil").get()).toEqual({ n: 0 });
  });

  it("la photo s'affiche à côté des messages du salon", async () => {
    const { env, alice, bob } = await deuxJoueurs();
    await envoyer(env, alice, PNG);
    await env.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: "coucou" } });
    const messages = (await env.appeler("GET", "/api/marche/salon", { cookie: bob })).json.messages as Array<{ auteurAvatar: { photo?: boolean } | null }>;
    expect(messages[0]?.auteurAvatar?.photo).toBe(true);
  });
});
