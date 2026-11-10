/**
 * Tests d'abus de l'étape 10 (durcissement sécurité). Chaque bloc correspond à un point de la revue de sécurité.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ipPourLimitation } from "../securite/limitation-tentatives";
import { creerEnvironnementDeTest } from "./outils/client-api-de-test";

const MDP = "mot-de-passe-solide";

afterEach(() => {
  vi.useRealTimers();
});

const connexion = (
  t: ReturnType<typeof creerEnvironnementDeTest>,
  pseudo: string,
  motDePasse: string,
  options: { ip?: string; appareil?: string | null } = {},
) => t.appeler("POST", "/api/auth/connexion", { corps: { pseudo, motDePasse }, ...options });

/** Inscrit un joueur et renvoie son cookie « appareil connu ». */
async function inscrireAvecAppareil(t: ReturnType<typeof creerEnvironnementDeTest>, pseudo: string) {
  const code = await t.creerInvitation();
  const r = await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo, motDePasse: MDP } });
  expect(r.statut).toBe(201);
  expect(r.appareil).toBeTruthy();
  return r.appareil as string;
}

describe("1. Un inconnu ne peut pas bloquer le propriétaire d'un compte", () => {
  it("le pseudo est bloqué pour les autres, mais pas sur un appareil déjà connu du compte", async () => {
    const t = creerEnvironnementDeTest();
    const appareil = await inscrireAvecAppareil(t, "Crousti");
    for (let i = 0; i < 10; i++) await connexion(t, "Crousti", "mauvais-mdp", { ip: `198.51.100.${i}` });

    expect((await connexion(t, "Crousti", MDP)).statut).toBe(429); // appareil inconnu : bloqué
    const r = await connexion(t, "Crousti", MDP, { appareil });
    expect(r.statut).toBe(200);
    expect(r.cookie).toBeTruthy();
  });

  it("le cookie appareil est HttpOnly, Secure, SameSite=Strict et seule son empreinte est en base", async () => {
    const t = creerEnvironnementDeTest();
    const code = await t.creerInvitation();
    const r = await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "Alice", motDePasse: MDP } });
    expect(r.setCookie).toMatch(/__Host-appareil=[^;]+;[^,]*HttpOnly/i);
    expect(r.setCookie).toMatch(/__Host-appareil=[^;]+;[^,]*Secure/i);
    expect(r.setCookie).toMatch(/__Host-appareil=[^;]+;[^,]*SameSite=Strict/i);
    const ligne = t.bd.prepare("SELECT jeton_hash FROM appareils_connus").get() as { jeton_hash: string };
    expect(ligne.jeton_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ligne.jeton_hash).not.toBe(r.appareil);
  });

  it("l'appareil a son propre compteur : 5 échecs depuis cet appareil le bloquent aussi", async () => {
    const t = creerEnvironnementDeTest();
    const appareil = await inscrireAvecAppareil(t, "Alice");
    for (let i = 0; i < 5; i++) expect((await connexion(t, "Alice", "mauvais-mdp", { appareil })).statut).toBe(401);
    expect((await connexion(t, "Alice", MDP, { appareil })).statut).toBe(429);
  });

  it("l'appareil d'un autre compte ne contourne pas le blocage", async () => {
    const t = creerEnvironnementDeTest();
    await inscrireAvecAppareil(t, "Alice");
    const appareilBob = await inscrireAvecAppareil(t, "Bob");
    for (let i = 0; i < 5; i++) await connexion(t, "Alice", "mauvais-mdp", { ip: `198.51.100.${i}` });
    expect((await connexion(t, "Alice", MDP, { appareil: appareilBob })).statut).toBe(429);
  });

  it("un cookie appareil inventé n'aide pas, et le cookie seul n'ouvre aucune session", async () => {
    const t = creerEnvironnementDeTest();
    const appareil = await inscrireAvecAppareil(t, "Alice");
    expect((await t.appeler("GET", "/api/auth/moi", { appareil })).statut).toBe(401);
    for (let i = 0; i < 5; i++) await connexion(t, "Alice", "mauvais-mdp", { ip: `198.51.100.${i}` });
    expect((await connexion(t, "Alice", MDP, { appareil: "invente-abcdefghijklmnopqrstuvwxyz0123456789" })).statut).toBe(429);
  });

  it("une réinitialisation du mot de passe oublie les appareils connus", async () => {
    const t = creerEnvironnementDeTest();
    await inscrireAvecAppareil(t, "Alice");
    const id = (t.bd.prepare("SELECT id FROM comptes WHERE pseudo = 'Alice'").get() as { id: number }).id;
    const admin = await t.inscrire("Crousti", MDP, "admin");
    await t.appeler("POST", "/api/admin/elevation", { cookie: admin, corps: { motDePasse: MDP } });
    const lien = await t.appeler("POST", `/api/admin/comptes/${id}/reinitialisation-mdp`, { cookie: admin, corps: {} });
    const r = await t.appeler("POST", "/api/auth/reinitialisation", { corps: { code: lien.json.code, motDePasse: "nouveau-mdp" } });
    expect(r.statut).toBe(200);
    const n = t.bd.prepare("SELECT COUNT(*) AS n FROM appareils_connus WHERE compte_id = ?").get(id) as { n: number };
    expect(n.n).toBe(0);
  });
});

describe("2. Les limites résistent aux requêtes simultanées", () => {
  it("30 connexions envoyées en même temps : 5 essais au plus sur le pseudo", async () => {
    const t = creerEnvironnementDeTest();
    await t.inscrire("Alice", MDP);
    const reponses = await Promise.all(
      Array.from({ length: 30 }, (_, i) => connexion(t, "Alice", `mauvais-${i}`, { ip: `198.51.100.${i}` })),
    );
    expect(reponses.filter((r) => r.statut === 401)).toHaveLength(5);
    expect(reponses.filter((r) => r.statut === 429)).toHaveLength(25);
  });

  it("20 élévations admin en même temps : 5 essais au plus", async () => {
    const t = creerEnvironnementDeTest();
    const admin = await t.inscrire("Crousti", MDP, "admin");
    const reponses = await Promise.all(
      Array.from({ length: 20 }, () => t.appeler("POST", "/api/admin/elevation", { cookie: admin, corps: { motDePasse: "faux" } })),
    );
    expect(reponses.filter((r) => r.statut === 401)).toHaveLength(5);
    expect(reponses.filter((r) => r.statut === 429)).toHaveLength(15);
  });

  it("40 messages en même temps : 20 acceptés au plus", async () => {
    const t = creerEnvironnementDeTest();
    const alice = await t.inscrire("Alice", MDP);
    const reponses = await Promise.all(
      Array.from({ length: 40 }, (_, i) => t.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: `m${i}` } })),
    );
    expect(reponses.filter((r) => r.statut === 201)).toHaveLength(20);
  });

  it("une connexion réussie ne consomme pas la limite par IP (seuls les échecs comptent)", async () => {
    const t = creerEnvironnementDeTest();
    await t.inscrire("Alice", MDP);
    for (let i = 0; i < 25; i++) expect((await connexion(t, "Alice", MDP)).statut).toBe(200);
  });

  it("la limite d'inscription ne compte pas les inscriptions réussies", async () => {
    const t = creerEnvironnementDeTest();
    for (let i = 0; i < 12; i++) await t.inscrire(`Joueur${i}`, MDP);
  });
});

describe("3. Un attaquant bloqué ne remplit plus la base", () => {
  it("un blocage n'est journalisé qu'une fois par fenêtre, même après 50 tentatives", async () => {
    const t = creerEnvironnementDeTest();
    for (let i = 0; i < 70; i++) await connexion(t, `Inconnu${i}`, "mauvais-mdp");
    const n = (type: string) =>
      (t.bd.prepare("SELECT COUNT(*) AS n FROM journal WHERE type = ?").get(type) as { n: number }).n;
    expect(n("connexion_echouee")).toBe(20); // limite par IP
    expect(n("connexion_bloquee")).toBe(1);
  });

  it("une connexion réussie purge le vieux journal, les sessions expirées et les vieux compteurs", async () => {
    const t = creerEnvironnementDeTest();
    await t.inscrire("Alice", MDP);
    const ilYa = (jours: number) => Date.now() - jours * 24 * 60 * 60_000;
    t.bd.prepare("INSERT INTO journal (horodatage, categorie, type) VALUES (?, 'securite', 'vieux')").run(ilYa(91));
    t.bd.prepare("INSERT INTO journal (horodatage, categorie, type) VALUES (?, 'securite', 'recent')").run(ilYa(10));
    t.bd.prepare("INSERT INTO limitations (cle, nombre, debut_fenetre) VALUES ('connexion:ip:192.0.2.1', 3, ?)").run(ilYa(3));
    t.bd.prepare(
      "INSERT INTO sessions (id_hash, compte_id, cree_le, expire_le, derniere_activite, ip, agent) VALUES ('perimee', 1, ?, ?, ?, 'x', 'x')",
    ).run(ilYa(40), ilYa(1), ilYa(8));

    expect((await connexion(t, "Alice", MDP)).statut).toBe(200);

    const types = (t.bd.prepare("SELECT type FROM journal").all() as Array<{ type: string }>).map((l) => l.type);
    expect(types).not.toContain("vieux");
    expect(types).toContain("recent");
    expect(t.bd.prepare("SELECT 1 FROM limitations WHERE cle = 'connexion:ip:192.0.2.1'").get()).toBeUndefined();
    expect(t.bd.prepare("SELECT 1 FROM sessions WHERE id_hash = 'perimee'").get()).toBeUndefined();
    expect((t.bd.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n).toBe(2); // inscription + connexion
  });
});

describe("4. Plafond journalier des messages", () => {
  it("au-delà de 500 messages ou annonces par jour, refus 429", async () => {
    const t = creerEnvironnementDeTest();
    const alice = await t.inscrire("Alice", MDP);
    const id = (t.bd.prepare("SELECT id FROM comptes WHERE pseudo = 'Alice'").get() as { id: number }).id;
    t.bd.prepare("INSERT INTO limitations (cle, nombre, debut_fenetre) VALUES (?, 499, ?)").run(`messages-jour:compte:${id}`, Date.now());
    expect((await t.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: "500e" } })).statut).toBe(201);
    const r = await t.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: "501e" } });
    expect(r.statut).toBe(429);
    expect(r.json.erreur).toBe("trop_de_messages");
  });

  it("le plafond repart le lendemain", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = creerEnvironnementDeTest();
    const alice = await t.inscrire("Alice", MDP);
    const id = (t.bd.prepare("SELECT id FROM comptes WHERE pseudo = 'Alice'").get() as { id: number }).id;
    t.bd.prepare("INSERT INTO limitations (cle, nombre, debut_fenetre) VALUES (?, 500, ?)").run(`messages-jour:compte:${id}`, Date.now());
    vi.setSystemTime(Date.now() + 24 * 60 * 60_000 + 1);
    expect((await t.appeler("POST", "/api/marche/salon", { cookie: alice, corps: { texte: "nouveau jour" } })).statut).toBe(201);
  });
});

describe("5. L'inscription ne révèle plus quels pseudos existent", () => {
  it("sans invitation valide, la réponse est la même pour un pseudo pris ou libre", async () => {
    const t = creerEnvironnementDeTest();
    await t.inscrire("Crousti", MDP, "admin");
    const code = "code-invente-abcdefghijklmnopqrstuvwxyz";
    const pris = await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "Crousti", motDePasse: MDP } });
    const libre = await t.appeler("POST", "/api/auth/inscription", { corps: { code, pseudo: "Personne", motDePasse: MDP } });
    expect(pris.statut).toBe(400);
    expect(pris.texte).toBe(libre.texte);
  });

  it("les essais sans invitation valide sont limités à 10 par heure", async () => {
    const t = creerEnvironnementDeTest();
    for (let i = 0; i < 10; i++) {
      const r = await t.appeler("POST", "/api/auth/inscription", {
        corps: { code: `code-invente-${i}-abcdefghijklmnopqrstuvwxyz`, pseudo: `Pseudo${i}`, motDePasse: MDP },
      });
      expect(r.statut).toBe(400);
    }
    const r = await t.appeler("POST", "/api/auth/inscription", {
      corps: { code: "code-invente-x-abcdefghijklmnopqrstuvwxyz", pseudo: "Crousti", motDePasse: MDP },
    });
    expect(r.statut).toBe(429);
  });
});

describe("6. IPv6 : la limite s'applique au bloc /64", () => {
  it("normalise les adresses", () => {
    expect(ipPourLimitation("203.0.113.10")).toBe("203.0.113.10");
    expect(ipPourLimitation("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
    expect(ipPourLimitation("2001:0DB8:0001:0002::ff")).toBe("2001:db8:1:2::/64");
    expect(ipPourLimitation("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipPourLimitation("::1")).toBe("0:0:0:0::/64");
    expect(ipPourLimitation("::ffff:198.51.100.7")).toBe("198.51.100.7");
    expect(ipPourLimitation("inconnue")).toBe("inconnue");
  });

  it("changer d'adresse dans le même /64 ne contourne pas la limite par IP", async () => {
    const t = creerEnvironnementDeTest();
    for (let i = 0; i < 20; i++) await connexion(t, `Inconnu${i}`, "mauvais-mdp", { ip: `2001:db8:1:2::${i.toString(16)}` });
    expect((await connexion(t, "Autre", "mauvais-mdp", { ip: "2001:db8:1:2:ffff::1" })).statut).toBe(429);
    expect((await connexion(t, "Autre", "mauvais-mdp", { ip: "2001:db8:1:3::1" })).statut).toBe(401); // autre bloc
  });
});
