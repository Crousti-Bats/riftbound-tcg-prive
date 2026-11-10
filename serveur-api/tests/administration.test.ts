import { afterEach, describe, expect, it, vi } from "vitest";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

const MDP = "mot-de-passe-admin-solide";

afterEach(() => vi.useRealTimers());

async function adminEleve(t: ReturnType<typeof creerEnvironnementDeTest>) {
  const cookie = await t.inscrire("Crousti", MDP, "admin");
  const r = await t.appeler("POST", "/api/admin/elevation", { cookie, corps: { motDePasse: MDP } });
  expect(r.statut).toBe(200);
  return cookie;
}

describe("Accès à l'administration", () => {
  it("un joueur n'a jamais accès, même en appelant l'élévation", async () => {
    const t = creerEnvironnementDeTest();
    const cookie = await t.inscrire("Alice", "mot-de-passe-joueur");
    expect((await t.appeler("GET", "/api/admin/comptes", { cookie })).statut).toBe(403);
    expect((await t.appeler("POST", "/api/admin/elevation", { cookie, corps: { motDePasse: "mot-de-passe-joueur" } })).statut).toBe(403);
  });

  it("un visiteur non connecté reçoit 401", async () => {
    const t = creerEnvironnementDeTest();
    expect((await t.appeler("GET", "/api/admin/comptes")).statut).toBe(401);
  });

  it("un admin doit re-saisir son mot de passe avant d'accéder", async () => {
    const t = creerEnvironnementDeTest();
    const cookie = await t.inscrire("Crousti", MDP, "admin");
    const avant = await t.appeler("GET", "/api/admin/comptes", { cookie });
    expect(avant.statut).toBe(403);
    expect(avant.json.erreur).toBe("elevation_requise");

    expect((await t.appeler("POST", "/api/admin/elevation", { cookie, corps: { motDePasse: "mauvais" } })).statut).toBe(401);
    expect((await t.appeler("POST", "/api/admin/elevation", { cookie, corps: { motDePasse: MDP } })).statut).toBe(200);
    expect((await t.appeler("GET", "/api/admin/comptes", { cookie })).statut).toBe(200);
  });

  it("l'accès admin se referme après 15 minutes d'inactivité", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = creerEnvironnementDeTest();
    const cookie = await adminEleve(t);
    vi.setSystemTime(Date.now() + 15 * 60_000 + 1);
    expect((await t.appeler("GET", "/api/admin/comptes", { cookie })).json.erreur).toBe("elevation_requise");
  });

  it("le bouton fermer referme l'accès admin immédiatement", async () => {
    const t = creerEnvironnementDeTest();
    const cookie = await adminEleve(t);
    await t.appeler("POST", "/api/admin/fermer", { cookie, corps: {} });
    expect((await t.appeler("GET", "/api/admin/comptes", { cookie })).statut).toBe(403);
  });
});

describe("Invitations", () => {
  it("l'admin crée une invitation joueur utilisable une seule fois", async () => {
    const t = creerEnvironnementDeTest();
    const cookie = await adminEleve(t);
    const creation = await t.appeler("POST", "/api/admin/invitations", { cookie, corps: { note: "pour Bob", dureeHeures: 24 } });
    expect(creation.statut).toBe(201);
    const code = creation.json.code as string;

    const inscription = await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "Bob", motDePasse: "mot-de-passe-de-bob" } });
    expect(inscription.json).toEqual({ pseudo: "Bob", role: "joueur" });

    const liste = await t.appeler("GET", "/api/admin/invitations", { cookie });
    const invitations = liste.json.invitations as Array<Record<string, unknown>>;
    expect(invitations[0]?.utiliseePar).toBe("Bob");
    expect(JSON.stringify(liste.json)).not.toContain(code);
  });

  it("une invitation révoquée ne fonctionne plus", async () => {
    const t = creerEnvironnementDeTest();
    const cookie = await adminEleve(t);
    const creation = await t.appeler("POST", "/api/admin/invitations", { cookie, corps: {} });
    expect((await t.appeler("DELETE", `/api/admin/invitations/${String(creation.json.id)}`, { cookie })).statut).toBe(200);
    const r = await t.appeler("POST", "/api/auth/inscription", {
      corps: { code: creation.json.code, pseudo: "Bob", motDePasse: "mot-de-passe-de-bob" },
    });
    expect(r.json.erreur).toBe("invitation_invalide");
  });

  it("impossible de créer une invitation admin depuis le site", async () => {
    const t = creerEnvironnementDeTest();
    const cookie = await adminEleve(t);
    const r = await t.appeler("POST", "/api/admin/invitations", { cookie, corps: { role: "admin" } });
    expect(r.statut).toBe(400);
  });
});

describe("Gestion des comptes", () => {
  it("désactiver un compte le déconnecte immédiatement", async () => {
    const t = creerEnvironnementDeTest();
    const admin = await adminEleve(t);
    const bob = await t.inscrire("Bob", "mot-de-passe-de-bob");
    const { id } = t.bd.prepare("SELECT id FROM comptes WHERE pseudo = 'Bob'").get() as { id: number };

    expect((await t.appeler("POST", `/api/admin/comptes/${id}/desactiver`, { cookie: admin, corps: {} })).statut).toBe(200);
    expect((await t.appeler("GET", "/api/auth/moi", { cookie: bob })).statut).toBe(401);

    await t.appeler("POST", `/api/admin/comptes/${id}/reactiver`, { cookie: admin, corps: {} });
    const r = await t.appeler("POST", "/api/auth/connexion", { corps: { pseudo: "Bob", motDePasse: "mot-de-passe-de-bob" } });
    expect(r.statut).toBe(200);
  });

  it("l'admin ne peut pas se désactiver lui-même", async () => {
    const t = creerEnvironnementDeTest();
    const admin = await adminEleve(t);
    const { id } = t.bd.prepare("SELECT id FROM comptes WHERE pseudo = 'Crousti'").get() as { id: number };
    expect((await t.appeler("POST", `/api/admin/comptes/${id}/desactiver`, { cookie: admin, corps: {} })).statut).toBe(400);
  });

  it("vider la collection d'un joueur ne touche pas aux autres et annule ses échanges en attente", async () => {
    const t = creerEnvironnementDeTest();
    const admin = await adminEleve(t);
    await t.inscrire("Bob", "mot-de-passe-de-bob");
    const idDe = (p: string) => (t.bd.prepare("SELECT id FROM comptes WHERE pseudo = ?").get(p) as { id: number }).id;
    const bob = idDe("Bob");
    const crousti = idDe("Crousti");
    const ajouter = t.bd.prepare("INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, ?, ?, ?)");
    ajouter.run(bob, "ogn-c0", 0, 3);
    ajouter.run(bob, "ogn-c1", 1, 1);
    ajouter.run(crousti, "ogn-c0", 0, 2);
    t.bd
      .prepare("INSERT INTO echanges (auteur_id, destinataire_id, statut, cree_le, expire_le) VALUES (?, ?, 'en_attente', ?, ?)")
      .run(crousti, bob, Date.now(), Date.now() + 86_400_000);

    const r = await t.appeler("POST", `/api/admin/comptes/${bob}/vider-collection`, { cookie: admin, corps: {} });
    expect(r.statut).toBe(200);
    expect(r.json.lignesSupprimees).toBe(2);
    const compter = (id: number) => (t.bd.prepare("SELECT COUNT(*) AS n FROM collection WHERE compte_id = ?").get(id) as { n: number }).n;
    expect(compter(bob)).toBe(0);
    expect(compter(crousti)).toBe(1);
    expect((t.bd.prepare("SELECT statut FROM echanges").get() as { statut: string }).statut).toBe("annule");
  });

  it("vider toutes les collections est réservé à l'admin", async () => {
    const t = creerEnvironnementDeTest();
    const joueur = await t.inscrire("Alice", "mot-de-passe-joueur");
    expect((await t.appeler("POST", "/api/admin/collections/vider", { cookie: joueur, corps: {} })).statut).toBe(403);

    const admin = await adminEleve(t);
    const id = (t.bd.prepare("SELECT id FROM comptes WHERE pseudo = 'Alice'").get() as { id: number }).id;
    t.bd.prepare("INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, 'ogn-c0', 0, 1)").run(id);
    expect((await t.appeler("POST", "/api/admin/collections/vider", { cookie: admin, corps: {} })).statut).toBe(200);
    expect((t.bd.prepare("SELECT COUNT(*) AS n FROM collection").get() as { n: number }).n).toBe(0);
  });

  it("chaque action admin est journalisée", async () => {
    const t = creerEnvironnementDeTest();
    const cookie = await adminEleve(t);
    await t.appeler("POST", "/api/admin/invitations", { cookie, corps: { note: "test" } });
    const journal = await t.appeler("GET", "/api/admin/journal", { cookie });
    const types = (journal.json.evenements as Array<{ type: string }>).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["inscription", "elevation", "invitation_creee"]));
  });
});
