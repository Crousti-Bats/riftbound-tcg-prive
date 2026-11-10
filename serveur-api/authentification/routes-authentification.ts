/**
 * Routes /api/auth : inscription (sur invitation), connexion, déconnexion, compte courant,
 * nouveau mot de passe (sur lien à usage unique créé par l'admin).
 * Messages d'erreur volontairement génériques : on ne révèle jamais si un pseudo existe.
 */
import { Hono } from "hono";
import { BOOSTERS_INITIAUX } from "../boosters/configuration-taux";
import { journaliser, requeteJournal } from "../journal-evenements";
import { lireCorps } from "../lecture-requete";
import { empreinteSha256 } from "../securite/jetons-et-empreintes";
import { enregistrerEchec, estBloque, REGLES, reinitialiser } from "../securite/limitation-tentatives";
import { HASH_FACTICE, hacherMotDePasse, verifierMotDePasse } from "../securite/mots-de-passe";
import type { ContexteApi, Role } from "../types-application";
import { schemaConnexion, schemaInscription, schemaReinitialisationMotDePasse } from "../validation-donnees";
import { creerSession, exigerConnexion, ipClient, supprimerSession } from "./sessions";

export const routesAuthentification = new Hono<ContexteApi>();

routesAuthentification.post("/inscription", async (c) => {
  const base = c.env.BASE_DE_DONNEES;
  const ip = ipClient(c);
  const cleIp = `inscription:ip:${ip}`;
  if (await estBloque(base, cleIp, REGLES.inscriptionParIp)) return c.json({ erreur: "trop_de_tentatives" }, 429);

  const lecture = await lireCorps(c, schemaInscription);
  if (!lecture.ok) return lecture.reponse;
  const { code, pseudo, motDePasse } = lecture.donnees;
  const maintenant = Date.now();

  // Le pseudo est-il libre ? (vérifié avant de consommer l'invitation)
  const existant = await base.prepare("SELECT 1 AS present FROM comptes WHERE pseudo = ?").bind(pseudo).first();
  if (existant) return c.json({ erreur: "pseudo_indisponible" }, 409);

  // Consommation atomique de l'invitation : une seule inscription possible, même en cas de requêtes simultanées.
  const invitation = await base
    .prepare(
      `UPDATE invitations SET utilisee_le = ?
       WHERE code_hash = ? AND utilisee_le IS NULL AND revoquee = 0 AND expire_le > ?
         AND (pseudo_reserve IS NULL OR pseudo_reserve = ?)
       RETURNING id, role`,
    )
    .bind(maintenant, await empreinteSha256(code), maintenant, pseudo)
    .first<{ id: number; role: Role }>();

  if (!invitation) {
    await enregistrerEchec(base, cleIp, REGLES.inscriptionParIp);
    await journaliser(base, { categorie: "securite", type: "inscription_refusee", pseudo, ip });
    return c.json({ erreur: "invitation_invalide" }, 400);
  }

  const hash = await hacherMotDePasse(motDePasse);
  let compte: { id: number } | null;
  try {
    compte = await base
      .prepare(
        `INSERT INTO comptes (pseudo, hash_mot_de_passe, role, cree_le, stock_boosters, boosters_tick)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .bind(pseudo, hash, invitation.role, maintenant, BOOSTERS_INITIAUX, maintenant)
      .first<{ id: number }>();
  } catch {
    compte = null; // pseudo pris entre-temps (contrainte UNIQUE)
  }
  if (!compte) {
    await base.prepare("UPDATE invitations SET utilisee_le = NULL WHERE id = ?").bind(invitation.id).run();
    return c.json({ erreur: "pseudo_indisponible" }, 409);
  }

  await base.batch([
    base.prepare("UPDATE invitations SET utilisee_par = ? WHERE id = ?").bind(compte.id, invitation.id),
    requeteJournal(base, {
      categorie: "securite",
      type: "inscription",
      compteId: compte.id,
      pseudo,
      ip,
      details: { role: invitation.role, invitationId: invitation.id },
    }),
  ]);
  await creerSession(c, compte.id);
  return c.json({ pseudo, role: invitation.role }, 201);
});

routesAuthentification.post("/connexion", async (c) => {
  const base = c.env.BASE_DE_DONNEES;
  const ip = ipClient(c);
  const lecture = await lireCorps(c, schemaConnexion);
  if (!lecture.ok) return lecture.reponse;
  const { pseudo, motDePasse } = lecture.donnees;

  const cleIp = `connexion:ip:${ip}`;
  const clePseudo = `connexion:pseudo:${pseudo.toLowerCase()}`;
  if (
    (await estBloque(base, cleIp, REGLES.connexionParIp)) ||
    (await estBloque(base, clePseudo, REGLES.connexionParPseudo))
  ) {
    await journaliser(base, { categorie: "securite", type: "connexion_bloquee", pseudo, ip });
    return c.json({ erreur: "trop_de_tentatives" }, 429);
  }

  const compte = await base
    .prepare("SELECT id, pseudo, hash_mot_de_passe, role, actif FROM comptes WHERE pseudo = ?")
    .bind(pseudo)
    .first<{ id: number; pseudo: string; hash_mot_de_passe: string; role: Role; actif: number }>();

  // Toujours calculer un hash, même si le compte n'existe pas (temps de réponse identique).
  const valide = await verifierMotDePasse(motDePasse, compte?.hash_mot_de_passe ?? HASH_FACTICE);

  if (!compte || !valide || compte.actif !== 1) {
    await enregistrerEchec(base, cleIp, REGLES.connexionParIp);
    await enregistrerEchec(base, clePseudo, REGLES.connexionParPseudo);
    await journaliser(base, {
      categorie: "securite",
      type: "connexion_echouee",
      compteId: compte?.id ?? null,
      pseudo,
      ip,
      details: { motif: !compte ? "pseudo_inconnu" : !valide ? "mot_de_passe" : "compte_desactive" },
    });
    return c.json({ erreur: "identifiants_invalides" }, 401);
  }

  await reinitialiser(base, clePseudo);
  await creerSession(c, compte.id);
  await journaliser(base, { categorie: "securite", type: "connexion_reussie", compteId: compte.id, pseudo: compte.pseudo, ip });
  return c.json({ pseudo: compte.pseudo, role: compte.role });
});

routesAuthentification.post("/deconnexion", async (c) => {
  const compte = c.get("compte");
  await supprimerSession(c);
  if (compte) {
    await journaliser(c.env.BASE_DE_DONNEES, {
      categorie: "securite",
      type: "deconnexion",
      compteId: compte.id,
      pseudo: compte.pseudo,
      ip: ipClient(c),
    });
  }
  return c.json({ ok: true });
});

routesAuthentification.get("/moi", exigerConnexion, (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  return c.json({ pseudo: compte.pseudo, role: compte.role, adminActif: compte.adminJusqua > Date.now() });
});

routesAuthentification.post("/reinitialisation", async (c) => {
  const base = c.env.BASE_DE_DONNEES;
  const ip = ipClient(c);
  const cleIp = `reinitialisation:ip:${ip}`;
  if (await estBloque(base, cleIp, REGLES.reinitialisationParIp)) return c.json({ erreur: "trop_de_tentatives" }, 429);

  const lecture = await lireCorps(c, schemaReinitialisationMotDePasse);
  if (!lecture.ok) return lecture.reponse;
  const { code, motDePasse } = lecture.donnees;
  const maintenant = Date.now();

  // Consommation atomique du lien : utilisable une seule fois, même en cas de requêtes simultanées.
  const lien = await base
    .prepare(
      `UPDATE reinitialisations_mdp SET utilisee_le = ?
       WHERE code_hash = ? AND utilisee_le IS NULL AND expire_le > ?
       RETURNING id, compte_id AS compteId`,
    )
    .bind(maintenant, await empreinteSha256(code), maintenant)
    .first<{ id: number; compteId: number }>();
  const compte = lien
    ? await base
        .prepare("SELECT pseudo, actif FROM comptes WHERE id = ?")
        .bind(lien.compteId)
        .first<{ pseudo: string; actif: number }>()
    : null;

  if (!lien || !compte || !compte.actif) {
    await enregistrerEchec(base, cleIp, REGLES.reinitialisationParIp);
    await journaliser(base, { categorie: "securite", type: "reinitialisation_refusee", ip });
    return c.json({ erreur: "lien_invalide" }, 400);
  }

  // Nouveau mot de passe, toutes les sessions fermées, les autres liens du compte invalidés.
  await base.batch([
    base.prepare("UPDATE comptes SET hash_mot_de_passe = ? WHERE id = ?").bind(await hacherMotDePasse(motDePasse), lien.compteId),
    base.prepare("DELETE FROM sessions WHERE compte_id = ?").bind(lien.compteId),
    base
      .prepare("UPDATE reinitialisations_mdp SET utilisee_le = ? WHERE compte_id = ? AND utilisee_le IS NULL")
      .bind(maintenant, lien.compteId),
    base.prepare("DELETE FROM limitations WHERE cle = ?").bind(`connexion:pseudo:${compte.pseudo.toLowerCase()}`),
    requeteJournal(base, { categorie: "securite", type: "mot_de_passe_reinitialise", compteId: lien.compteId, pseudo: compte.pseudo, ip }),
  ]);
  return c.json({ pseudo: compte.pseudo });
});
