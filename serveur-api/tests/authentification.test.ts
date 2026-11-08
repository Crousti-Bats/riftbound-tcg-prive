import { afterEach, describe, expect, it, vi } from "vitest";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

const MDP = "un-mot-de-passe-solide";

afterEach(() => vi.useRealTimers());

describe("Inscription sur invitation", () => {
  it("crée le compte, ouvre une session et /moi renvoie le pseudo", async () => {
    const t = creerEnvironnementDeTest();
    const code = await t.creerInvitation();
    const r = await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "Alice", motDePasse: MDP } });
    expect(r.statut).toBe(201);
    expect(r.json).toEqual({ pseudo: "Alice", role: "joueur" });
    expect(r.setCookie).toMatch(/HttpOnly/i);
    expect(r.setCookie).toMatch(/Secure/i);
    expect(r.setCookie).toMatch(/SameSite=Strict/i);

    const moi = await t.appeler("GET", "/api/auth/moi", { cookie: r.cookie });
    expect(moi.json).toEqual({ pseudo: "Alice", role: "joueur", adminActif: false });
  });

  it("refuse une invitation déjà utilisée", async () => {
    const t = creerEnvironnementDeTest();
    const code = await t.creerInvitation();
    await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "Alice", motDePasse: MDP } });
    const r = await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "Bob", motDePasse: MDP } });
    expect(r.statut).toBe(400);
    expect(r.json.erreur).toBe("invitation_invalide");
  });

  it("refuse une invitation expirée, révoquée ou inconnue", async () => {
    const t = creerEnvironnementDeTest();
    const expiree = await t.creerInvitation({ expireDansMs: -1 });
    const revoquee = await t.creerInvitation();
    t.bd.prepare("UPDATE invitations SET revoquee = 1").run();
    for (const code of [expiree, revoquee, "code-totalement-invente-abcdefghij"]) {
      const r = await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "Alice", motDePasse: MDP } });
      expect(r.json.erreur).toBe("invitation_invalide");
    }
  });

  it("respecte le pseudo réservé de l'invitation (insensible à la casse)", async () => {
    const t = creerEnvironnementDeTest();
    const code = await t.creerInvitation({ pseudoReserve: "Crousti" });
    const autre = await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "Voleur", motDePasse: MDP } });
    expect(autre.statut).toBe(400);
    const bon = await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "crousti", motDePasse: MDP } });
    expect(bon.statut).toBe(201);
  });

  it("refuse un pseudo déjà pris sans consommer l'invitation", async () => {
    const t = creerEnvironnementDeTest();
    await t.inscrire("Alice", MDP);
    const code = await t.creerInvitation();
    const r = await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "ALICE", motDePasse: MDP } });
    expect(r.statut).toBe(409);
    const ok = await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "Bob", motDePasse: MDP } });
    expect(ok.statut).toBe(201);
  });

  it("refuse un mot de passe trop court et des champs inattendus", async () => {
    const t = creerEnvironnementDeTest();
    const code = await t.creerInvitation();
    const court = await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "Alice", motDePasse: "court" } });
    expect(court.statut).toBe(400);
    const intrus = await t.appeler("POST", "/api/auth/inscription", {
      corps: { code, pseudo: "Alice", motDePasse: MDP, role: "admin" },
    });
    expect(intrus.statut).toBe(400);
  });

  it("accepte 6 caractères et refuse 5", async () => {
    const t = creerEnvironnementDeTest();
    const code = await t.creerInvitation();
    expect((await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "Alice", motDePasse: "12345" } })).statut).toBe(400);
    expect((await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "Alice", motDePasse: "123456" } })).statut).toBe(201);
  });

  it("ne stocke ni le mot de passe ni le jeton de session en clair", async () => {
    const t = creerEnvironnementDeTest();
    const cookie = await t.inscrire("Alice", MDP);
    const compte = t.bd.prepare("SELECT hash_mot_de_passe FROM comptes").get() as { hash_mot_de_passe: string };
    expect(compte.hash_mot_de_passe).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(compte.hash_mot_de_passe).not.toContain(MDP);
    const session = t.bd.prepare("SELECT id_hash FROM sessions").get() as { id_hash: string };
    expect(session.id_hash).not.toBe(cookie);
    expect(session.id_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Connexion", () => {
  it("connecte avec les bons identifiants", async () => {
    const t = creerEnvironnementDeTest();
    await t.inscrire("Alice", MDP);
    const r = await t.appeler("POST", "/api/auth/connexion", { corps: { pseudo: "alice", motDePasse: MDP } });
    expect(r.statut).toBe(200);
    expect(r.cookie).toBeTruthy();
  });

  it("renvoie le même message pour un mauvais mot de passe et un pseudo inconnu", async () => {
    const t = creerEnvironnementDeTest();
    await t.inscrire("Alice", MDP);
    const mauvais = await t.appeler("POST", "/api/auth/connexion", { corps: { pseudo: "Alice", motDePasse: "faux-mot-de-passe" } });
    const inconnu = await t.appeler("POST", "/api/auth/connexion", { corps: { pseudo: "Personne", motDePasse: MDP } });
    expect(mauvais.statut).toBe(401);
    expect(inconnu.statut).toBe(401);
    expect(mauvais.texte).toBe(inconnu.texte);
  });

  it("bloque après 5 échecs sur un pseudo, même avec le bon mot de passe ensuite", async () => {
    const t = creerEnvironnementDeTest();
    await t.inscrire("Alice", MDP);
    for (let i = 0; i < 5; i++) {
      await t.appeler("POST", "/api/auth/connexion", { corps: { pseudo: "Alice", motDePasse: "mauvais-mdp" }, ip: `198.51.100.${i}` });
    }
    const r = await t.appeler("POST", "/api/auth/connexion", { corps: { pseudo: "Alice", motDePasse: MDP } });
    expect(r.statut).toBe(429);
  });

  it("débloque après 15 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = creerEnvironnementDeTest();
    await t.inscrire("Alice", MDP);
    for (let i = 0; i < 5; i++) await t.appeler("POST", "/api/auth/connexion", { corps: { pseudo: "Alice", motDePasse: "mauvais-mdp" } });
    vi.setSystemTime(Date.now() + 15 * 60_000 + 1);
    const r = await t.appeler("POST", "/api/auth/connexion", { corps: { pseudo: "Alice", motDePasse: MDP } });
    expect(r.statut).toBe(200);
  });

  it("résiste à une tentative d'injection SQL", async () => {
    const t = creerEnvironnementDeTest();
    await t.inscrire("Alice", MDP);
    const r = await t.appeler("POST", "/api/auth/connexion", { corps: { pseudo: "' OR 1=1 --", motDePasse: "x' OR '1'='1" } });
    expect(r.statut).toBe(401);
    expect(t.bd.prepare("SELECT COUNT(*) AS n FROM comptes").get()).toEqual({ n: 1 });
  });

  it("refuse un compte désactivé et invalide ses sessions", async () => {
    const t = creerEnvironnementDeTest();
    const cookie = await t.inscrire("Alice", MDP);
    t.bd.prepare("UPDATE comptes SET actif = 0").run();
    expect((await t.appeler("GET", "/api/auth/moi", { cookie })).statut).toBe(401);
    const r = await t.appeler("POST", "/api/auth/connexion", { corps: { pseudo: "Alice", motDePasse: MDP } });
    expect(r.statut).toBe(401);
  });
});

describe("Sessions", () => {
  it("la déconnexion supprime la session côté serveur", async () => {
    const t = creerEnvironnementDeTest();
    const cookie = await t.inscrire("Alice", MDP);
    await t.appeler("POST", "/api/auth/deconnexion", { cookie, corps: {} });
    expect((await t.appeler("GET", "/api/auth/moi", { cookie })).statut).toBe(401);
    expect(t.bd.prepare("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({ n: 0 });
  });

  it("une session expire après 7 jours d'inactivité", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = creerEnvironnementDeTest();
    const cookie = await t.inscrire("Alice", MDP);
    vi.setSystemTime(Date.now() + 7 * 24 * 60 * 60_000 + 1);
    expect((await t.appeler("GET", "/api/auth/moi", { cookie })).statut).toBe(401);
  });

  it("un cookie inventé n'ouvre rien", async () => {
    const t = creerEnvironnementDeTest();
    expect((await t.appeler("GET", "/api/auth/moi", { cookie: "jeton-invente" })).statut).toBe(401);
  });
});

describe("Protection CSRF", () => {
  it("refuse une requête sans Origin ou d'une autre origine", async () => {
    const t = creerEnvironnementDeTest();
    const corps = { pseudo: "Alice", motDePasse: MDP };
    expect((await t.appeler("POST", "/api/auth/connexion", { corps, entetes: { Origin: "" } })).statut).toBe(403);
    expect((await t.appeler("POST", "/api/auth/connexion", { corps, entetes: { Origin: "https://pirate.example" } })).statut).toBe(403);
  });

  it("refuse un corps qui n'est pas du JSON", async () => {
    const t = creerEnvironnementDeTest();
    const r = await t.appeler("POST", "/api/auth/connexion", { corps: {}, entetes: { "Content-Type": "text/plain" } });
    expect(r.statut).toBe(415);
  });
});
