/**
 * Routes /api/auth : inscription (sur invitation), connexion, déconnexion, compte courant,
 * nouveau mot de passe (sur lien à usage unique créé par l'admin).
 * Messages d'erreur volontairement génériques : on ne révèle jamais si un pseudo existe.
 *
 * Limitation des tentatives (étape 10) : chaque tentative est comptée AVANT d'être traitée (atomique, résiste
 * aux requêtes simultanées), puis remboursée si elle réussit. Un blocage n'est journalisé qu'une fois par fenêtre
 * (sinon un attaquant bloqué pourrait remplir la base et épuiser le quota d'écritures).
 */
import { Hono } from "hono";
import { BOOSTERS_INITIAUX } from "../boosters/configuration-taux";
import { purgerAnciennesDonnees } from "../entretien-base";
import { journaliser, requeteJournal } from "../journal-evenements";
import { lireCorps } from "../lecture-requete";
import { empreinteSha256 } from "../securite/jetons-et-empreintes";
import {
  compterTentative,
  ipPourLimitation,
  REGLES,
  reinitialiser,
  rembourserTentative,
} from "../securite/limitation-tentatives";
import { HASH_FACTICE, hacherMotDePasse, verifierMotDePasse } from "../securite/mots-de-passe";
import type { ContexteApi, Role } from "../types-application";
import { schemaConnexion, schemaInscription, schemaReinitialisationMotDePasse } from "../validation-donnees";
import { appareilConnuDuCompte, memoriserAppareil } from "./appareils-connus";
import { creerSession, exigerConnexion, ipClient, supprimerSession } from "./sessions";

export const routesAuthentification = new Hono<ContexteApi>();

routesAuthentification.post("/inscription", async (c) => {
  const base = c.env.BASE_DE_DONNEES;
  const ip = ipClient(c);
  const lecture = await lireCorps(c, schemaInscription);
  if (!lecture.ok) return lecture.reponse;
  const { code, pseudo, motDePasse } = lecture.donnees;

  const cleIp = `inscription:ip:${ipPourLimitation(ip)}`;
  if (!(await compterTentative(base, cleIp, REGLES.inscriptionParIp)).autorisee) {
    return c.json({ erreur: "trop_de_tentatives" }, 429);
  }
  const maintenant = Date.now();

  // L'invitation est vérifiée EN PREMIER : sans code valide, on ne dit rien sur les pseudos existants.
  // Consommation atomique : une seule inscription possible, même en cas de requêtes simultanées.
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
    compte = null; // pseudo déjà pris (contrainte UNIQUE, insensible à la casse)
  }
  if (!compte) {
    // L'invitation est rendue : son titulaire peut réessayer avec un autre pseudo.
    await base.prepare("UPDATE invitations SET utilisee_le = NULL WHERE id = ?").bind(invitation.id).run();
    return c.json({ erreur: "pseudo_indisponible" }, 409);
  }

  await rembourserTentative(base, cleIp);
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
  await memoriserAppareil(c, compte.id, null);
  return c.json({ pseudo, role: invitation.role }, 201);
});

routesAuthentification.post("/connexion", async (c) => {
  const base = c.env.BASE_DE_DONNEES;
  const ip = ipClient(c);
  const lecture = await lireCorps(c, schemaConnexion);
  if (!lecture.ok) return lecture.reponse;
  const { pseudo, motDePasse } = lecture.donnees;

  const bloquee = async (premierRefus: boolean) => {
    if (premierRefus) await journaliser(base, { categorie: "securite", type: "connexion_bloquee", pseudo, ip });
    return c.json({ erreur: "trop_de_tentatives" }, 429);
  };

  // 1. Limite par IP (préfixe /64 en IPv6).
  const cleIp = `connexion:ip:${ipPourLimitation(ip)}`;
  const tentativeIp = await compterTentative(base, cleIp, REGLES.connexionParIp);
  if (!tentativeIp.autorisee) return bloquee(tentativeIp.premierRefus);

  const compte = await base
    .prepare("SELECT id, pseudo, hash_mot_de_passe, role, actif FROM comptes WHERE pseudo = ?")
    .bind(pseudo)
    .first<{ id: number; pseudo: string; hash_mot_de_passe: string; role: Role; actif: number }>();

  // 2. Limite par compte : sur un appareil déjà connu de ce compte, compteur propre à l'appareil ;
  //    ailleurs, compteur du pseudo. (Recherche faite même si le pseudo n'existe pas : même temps de réponse.)
  const appareil = await appareilConnuDuCompte(c, compte?.id ?? -1);
  const cleCompte = appareil ? `connexion:appareil:${appareil}` : `connexion:pseudo:${pseudo.toLowerCase()}`;
  const regleCompte = appareil ? REGLES.connexionParAppareil : REGLES.connexionParPseudo;
  const tentativeCompte = await compterTentative(base, cleCompte, regleCompte);
  if (!tentativeCompte.autorisee) return bloquee(tentativeCompte.premierRefus);

  // Toujours calculer un hash, même si le compte n'existe pas (temps de réponse identique).
  const valide = await verifierMotDePasse(motDePasse, compte?.hash_mot_de_passe ?? HASH_FACTICE);

  if (!compte || !valide || compte.actif !== 1) {
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

  // Réussite : seuls les échecs restent comptés.
  await rembourserTentative(base, cleIp);
  await reinitialiser(base, cleCompte);
  await creerSession(c, compte.id);
  await memoriserAppareil(c, compte.id, appareil);
  await journaliser(base, { categorie: "securite", type: "connexion_reussie", compteId: compte.id, pseudo: compte.pseudo, ip });
  try {
    await purgerAnciennesDonnees(base);
  } catch (err) {
    console.error("purge des anciennes données impossible", err); // ne doit jamais empêcher la connexion
  }
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
  const lecture = await lireCorps(c, schemaReinitialisationMotDePasse);
  if (!lecture.ok) return lecture.reponse;
  const { code, motDePasse } = lecture.donnees;

  const cleIp = `reinitialisation:ip:${ipPourLimitation(ip)}`;
  if (!(await compterTentative(base, cleIp, REGLES.reinitialisationParIp)).autorisee) {
    return c.json({ erreur: "trop_de_tentatives" }, 429);
  }
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
    await journaliser(base, { categorie: "securite", type: "reinitialisation_refusee", ip });
    return c.json({ erreur: "lien_invalide" }, 400);
  }

  // Nouveau mot de passe, sessions et appareils connus oubliés, autres liens du compte invalidés.
  await rembourserTentative(base, cleIp);
  await base.batch([
    base.prepare("UPDATE comptes SET hash_mot_de_passe = ? WHERE id = ?").bind(await hacherMotDePasse(motDePasse), lien.compteId),
    base.prepare("DELETE FROM sessions WHERE compte_id = ?").bind(lien.compteId),
    base.prepare("DELETE FROM appareils_connus WHERE compte_id = ?").bind(lien.compteId),
    base
      .prepare("UPDATE reinitialisations_mdp SET utilisee_le = ? WHERE compte_id = ? AND utilisee_le IS NULL")
      .bind(maintenant, lien.compteId),
    base.prepare("DELETE FROM limitations WHERE cle = ?").bind(`connexion:pseudo:${compte.pseudo.toLowerCase()}`),
    requeteJournal(base, { categorie: "securite", type: "mot_de_passe_reinitialise", compteId: lien.compteId, pseudo: compte.pseudo, ip }),
  ]);
  return c.json({ pseudo: compte.pseudo });
});
