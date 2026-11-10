/**
 * Routes /api/admin : réservées au rôle admin.
 * - POST /elevation : re-saisie du mot de passe → ouvre l'accès admin 15 minutes (glissantes).
 * - Toutes les autres routes exigent role=admin ET un accès admin ouvert (vérifié côté serveur à chaque requête).
 * - Chaque action est journalisée.
 */
import { type Context, Hono } from "hono";
import {
  DUREE_ADMIN_MS,
  exigerAdmin,
  exigerAdminSansProlonger,
  exigerConnexion,
  ipClient,
} from "../authentification/sessions";
import { journaliser, requeteJournal } from "../journal-evenements";
import { lireCorps } from "../lecture-requete";
import { collecterMonitoring } from "./monitoring";
import { empreinteSha256, jetonAleatoire } from "../securite/jetons-et-empreintes";
import { enregistrerEchec, estBloque, REGLES, reinitialiser } from "../securite/limitation-tentatives";
import { verifierMotDePasse } from "../securite/mots-de-passe";
import type { ContexteApi } from "../types-application";
import { schemaCreationInvitation, schemaElevation, schemaIdentifiant, schemaLimiteJournal } from "../validation-donnees";

export const routesAdministration = new Hono<ContexteApi>();

routesAdministration.post("/elevation", exigerConnexion, async (c) => {
  const compte = c.get("compte");
  const base = c.env.BASE_DE_DONNEES;
  if (!compte || compte.role !== "admin") return c.json({ erreur: "interdit" }, 403);

  const cle = `elevation:compte:${compte.id}`;
  if (await estBloque(base, cle, REGLES.elevationAdmin)) return c.json({ erreur: "trop_de_tentatives" }, 429);

  const lecture = await lireCorps(c, schemaElevation);
  if (!lecture.ok) return lecture.reponse;

  const ligne = await base
    .prepare("SELECT hash_mot_de_passe FROM comptes WHERE id = ?")
    .bind(compte.id)
    .first<{ hash_mot_de_passe: string }>();
  const ip = ipClient(c);
  if (!ligne || !(await verifierMotDePasse(lecture.donnees.motDePasse, ligne.hash_mot_de_passe))) {
    await enregistrerEchec(base, cle, REGLES.elevationAdmin);
    await journaliser(base, { categorie: "securite", type: "elevation_echouee", compteId: compte.id, pseudo: compte.pseudo, ip });
    return c.json({ erreur: "mot_de_passe_incorrect" }, 401);
  }

  await reinitialiser(base, cle);
  const jusqua = Date.now() + DUREE_ADMIN_MS;
  await base.batch([
    base.prepare("UPDATE sessions SET admin_jusqua = ? WHERE id_hash = ?").bind(jusqua, compte.sessionIdHash),
    requeteJournal(base, { categorie: "admin", type: "elevation", compteId: compte.id, pseudo: compte.pseudo, ip }),
  ]);
  return c.json({ adminJusqua: jusqua });
});

// Toutes les routes suivantes : admin avec accès ouvert.
// Le tableau de bord, rafraîchi automatiquement, vérifie l'accès SANS le prolonger.
routesAdministration.use("/*", async (c, next) => {
  if (c.req.path.endsWith("/elevation")) return next();
  if (c.req.method === "GET" && c.req.path.endsWith("/monitoring")) return exigerAdminSansProlonger(c, next);
  return exigerAdmin(c, next);
});

// ---------- Monitoring (étape 8) ----------

routesAdministration.get("/monitoring", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(await collecterMonitoring(c));
});

routesAdministration.post("/fermer", async (c) => {
  const compte = c.get("compte");
  if (compte) {
    await c.env.BASE_DE_DONNEES.prepare("UPDATE sessions SET admin_jusqua = 0 WHERE id_hash = ?").bind(compte.sessionIdHash).run();
  }
  return c.json({ ok: true });
});

// ---------- Invitations ----------

routesAdministration.get("/invitations", async (c) => {
  const { results } = await c.env.BASE_DE_DONNEES.prepare(
    `SELECT i.id, i.role, i.pseudo_reserve AS pseudoReserve, i.note, i.cree_le AS creeLe, i.expire_le AS expireLe,
            i.utilisee_le AS utiliseeLe, i.revoquee, u.pseudo AS utiliseePar
     FROM invitations i LEFT JOIN comptes u ON u.id = i.utilisee_par
     ORDER BY i.cree_le DESC LIMIT 200`,
  ).all();
  return c.json({ invitations: results });
});

routesAdministration.post("/invitations", async (c) => {
  const compte = c.get("compte");
  const lecture = await lireCorps(c, schemaCreationInvitation);
  if (!lecture.ok || !compte) return lecture.ok ? c.json({ erreur: "non_connecte" }, 401) : lecture.reponse;
  const { note, pseudoReserve, dureeHeures } = lecture.donnees;

  const base = c.env.BASE_DE_DONNEES;
  const code = jetonAleatoire();
  const maintenant = Date.now();
  const expireLe = maintenant + dureeHeures * 60 * 60_000;
  const [insertion] = await base.batch<{ id: number }>([
    // Les invitations créées depuis le site sont toujours des invitations "joueur".
    base
      .prepare(
        "INSERT INTO invitations (code_hash, role, pseudo_reserve, note, cree_par, cree_le, expire_le) VALUES (?, 'joueur', ?, ?, ?, ?, ?) RETURNING id",
      )
      .bind(await empreinteSha256(code), pseudoReserve ?? null, note ?? null, compte.id, maintenant, expireLe),
    requeteJournal(base, {
      categorie: "admin",
      type: "invitation_creee",
      compteId: compte.id,
      pseudo: compte.pseudo,
      ip: ipClient(c),
      details: { pseudoReserve: pseudoReserve ?? null, note: note ?? null, dureeHeures },
    }),
  ]);
  // Le code n'est renvoyé qu'une seule fois : il n'est stocké nulle part en clair.
  return c.json({ id: insertion?.results[0]?.id, code, expireLe }, 201);
});

routesAdministration.delete("/invitations/:id", async (c) => {
  const compte = c.get("compte");
  const id = schemaIdentifiant.safeParse(c.req.param("id"));
  if (!id.success || !compte) return c.json({ erreur: "identifiant_invalide" }, 400);
  const base = c.env.BASE_DE_DONNEES;
  const [maj] = await base.batch([
    base.prepare("UPDATE invitations SET revoquee = 1 WHERE id = ? AND utilisee_le IS NULL").bind(id.data),
    requeteJournal(base, {
      categorie: "admin",
      type: "invitation_revoquee",
      compteId: compte.id,
      pseudo: compte.pseudo,
      ip: ipClient(c),
      details: { invitationId: id.data },
    }),
  ]);
  if (!maj?.meta.changes) return c.json({ erreur: "introuvable_ou_deja_utilisee" }, 404);
  return c.json({ ok: true });
});

// ---------- Comptes ----------

routesAdministration.get("/comptes", async (c) => {
  const { results } = await c.env.BASE_DE_DONNEES.prepare(
    `SELECT c.id, c.pseudo, c.role, c.actif, c.cree_le AS creeLe, c.derniere_activite AS derniereActivite,
            (SELECT COUNT(*) FROM sessions s WHERE s.compte_id = c.id AND s.expire_le > ?) AS sessionsActives
     FROM comptes c ORDER BY c.cree_le ASC`,
  )
    .bind(Date.now())
    .all();
  return c.json({ comptes: results });
});

type ActionCompte = "desactiver" | "reactiver" | "deconnecter";

async function actionSurCompte(c: Context<ContexteApi>, action: ActionCompte) {
  const admin = c.get("compte");
  const id = schemaIdentifiant.safeParse(c.req.param("id"));
  if (!id.success || !admin) return c.json({ erreur: "identifiant_invalide" }, 400);
  if (id.data === admin.id && action !== "deconnecter") return c.json({ erreur: "action_sur_soi_interdite" }, 400);

  const base = c.env.BASE_DE_DONNEES;
  const cible = await base.prepare("SELECT pseudo FROM comptes WHERE id = ?").bind(id.data).first<{ pseudo: string }>();
  if (!cible) return c.json({ erreur: "introuvable" }, 404);

  const requetes: D1PreparedStatement[] = [];
  if (action === "desactiver") requetes.push(base.prepare("UPDATE comptes SET actif = 0 WHERE id = ?").bind(id.data));
  if (action === "reactiver") requetes.push(base.prepare("UPDATE comptes SET actif = 1 WHERE id = ?").bind(id.data));
  if (action !== "reactiver") requetes.push(base.prepare("DELETE FROM sessions WHERE compte_id = ?").bind(id.data));
  requetes.push(
    requeteJournal(base, {
      categorie: "admin",
      type: `compte_${action}`,
      compteId: admin.id,
      pseudo: admin.pseudo,
      ip: ipClient(c),
      details: { cibleId: id.data, ciblePseudo: cible.pseudo },
    }),
  );
  await base.batch(requetes);
  return c.json({ ok: true });
}

routesAdministration.post("/comptes/:id/desactiver", (c) => actionSurCompte(c, "desactiver"));
routesAdministration.post("/comptes/:id/reactiver", (c) => actionSurCompte(c, "reactiver"));
routesAdministration.post("/comptes/:id/deconnecter", (c) => actionSurCompte(c, "deconnecter"));

// ---------- Mot de passe oublié ----------
// Le site n'a pas d'e-mail : l'admin crée un lien à usage unique (24 h) et le transmet lui-même au joueur.
// Le code n'est renvoyé qu'une fois et seule son empreinte est stockée.

const DUREE_LIEN_REINITIALISATION_MS = 24 * 60 * 60_000;

routesAdministration.post("/comptes/:id/reinitialisation-mdp", async (c) => {
  const admin = c.get("compte");
  const id = schemaIdentifiant.safeParse(c.req.param("id"));
  if (!id.success || !admin) return c.json({ erreur: "identifiant_invalide" }, 400);

  const base = c.env.BASE_DE_DONNEES;
  const cible = await base.prepare("SELECT pseudo FROM comptes WHERE id = ?").bind(id.data).first<{ pseudo: string }>();
  if (!cible) return c.json({ erreur: "introuvable" }, 404);

  const code = jetonAleatoire();
  const maintenant = Date.now();
  const expireLe = maintenant + DUREE_LIEN_REINITIALISATION_MS;
  await base.batch([
    // Un seul lien valide à la fois par compte : les précédents sont invalidés.
    base.prepare("UPDATE reinitialisations_mdp SET expire_le = ? WHERE compte_id = ? AND utilisee_le IS NULL").bind(maintenant, id.data),
    base
      .prepare("INSERT INTO reinitialisations_mdp (compte_id, code_hash, cree_par, cree_le, expire_le) VALUES (?, ?, ?, ?, ?)")
      .bind(id.data, await empreinteSha256(code), admin.id, maintenant, expireLe),
    requeteJournal(base, {
      categorie: "admin",
      type: "reinitialisation_creee",
      compteId: admin.id,
      pseudo: admin.pseudo,
      ip: ipClient(c),
      details: { cibleId: id.data, ciblePseudo: cible.pseudo },
    }),
  ]);
  return c.json({ code, expireLe, pseudo: cible.pseudo }, 201);
});

// ---------- Remise à zéro des collections ----------
// Vide la collection (toutes les cartes, foil compris) et annule les échanges en attente concernés :
// ils porteraient sur des cartes qui n'existent plus. Le stock de boosters et l'historique d'ouvertures sont conservés.

routesAdministration.post("/comptes/:id/vider-collection", async (c) => {
  const admin = c.get("compte");
  const id = schemaIdentifiant.safeParse(c.req.param("id"));
  if (!id.success || !admin) return c.json({ erreur: "identifiant_invalide" }, 400);

  const base = c.env.BASE_DE_DONNEES;
  const cible = await base.prepare("SELECT pseudo FROM comptes WHERE id = ?").bind(id.data).first<{ pseudo: string }>();
  if (!cible) return c.json({ erreur: "introuvable" }, 404);

  const [suppression] = await base.batch([
    base.prepare("DELETE FROM collection WHERE compte_id = ?").bind(id.data),
    base
      .prepare(
        "UPDATE echanges SET statut = 'annule', termine_le = ? WHERE statut = 'en_attente' AND (auteur_id = ? OR destinataire_id = ?)",
      )
      .bind(Date.now(), id.data, id.data),
    requeteJournal(base, {
      categorie: "admin",
      type: "collection_videe",
      compteId: admin.id,
      pseudo: admin.pseudo,
      ip: ipClient(c),
      details: { cibleId: id.data, ciblePseudo: cible.pseudo },
    }),
  ]);
  return c.json({ ok: true, lignesSupprimees: suppression?.meta.changes ?? 0 });
});

routesAdministration.post("/collections/vider", async (c) => {
  const admin = c.get("compte");
  if (!admin) return c.json({ erreur: "non_connecte" }, 401);
  const base = c.env.BASE_DE_DONNEES;
  const [suppression] = await base.batch([
    base.prepare("DELETE FROM collection"),
    base.prepare("UPDATE echanges SET statut = 'annule', termine_le = ? WHERE statut = 'en_attente'").bind(Date.now()),
    requeteJournal(base, {
      categorie: "admin",
      type: "collections_videes",
      compteId: admin.id,
      pseudo: admin.pseudo,
      ip: ipClient(c),
    }),
  ]);
  return c.json({ ok: true, lignesSupprimees: suppression?.meta.changes ?? 0 });
});

// ---------- Journal ----------

routesAdministration.get("/journal", async (c) => {
  const limite = schemaLimiteJournal.parse(c.req.query("limite") ?? undefined);
  const { results } = await c.env.BASE_DE_DONNEES.prepare(
    `SELECT id, horodatage, categorie, type, pseudo, ip, details FROM journal ORDER BY id DESC LIMIT ?`,
  )
    .bind(limite)
    .all();
  return c.json({ evenements: results });
});
