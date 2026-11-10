/**
 * Routes /api/marche : annonces « Qui a ? / Qui veut ? », salon commun et messages privés.
 *
 * Règles (décidées par l'utilisateur le 2026-11-10) :
 * - une annonce reste sur le tableau du marché jusqu'à ce que son auteur la retire (30 jours maximum),
 *   et elle est aussi publiée dans le salon avec la carte à côté ;
 * - « Qui veut ? » : on ne peut proposer qu'une carte qu'on possède ; l'annonce disparaît si on ne l'a plus ;
 * - salon commun visible par tous les joueurs + conversations privées entre deux joueurs.
 *
 * Sécurité : texte brut uniquement (affiché par React, jamais interprété comme du HTML), longueurs limitées,
 * anti-spam par compte, modération par l'auteur ou par un admin dont l'accès admin est ouvert.
 */
import { type Context, Hono } from "hono";
import { z } from "zod";
import { exigerConnexion } from "../authentification/sessions";
import { sansAccents } from "../catalogue/recherche-texte";
import { obtenirCatalogue } from "../catalogue/source-cartes";
import type { CarteCatalogue } from "../catalogue/types-catalogue";
import { lireCorps } from "../lecture-requete";
import { compterTentative, REGLES } from "../securite/limitation-tentatives";
import type { CompteConnecte, ContexteApi } from "../types-application";
import { schemaIdentifiant, schemaPseudo } from "../validation-donnees";

export const routesMarche = new Hono<ContexteApi>();

routesMarche.use("*", exigerConnexion);

export const DUREE_ANNONCE_MS = 30 * 24 * 60 * 60_000;
export const MAX_ANNONCES_ACTIVES = 30;
const MESSAGES_PAR_PAGE = 50;
const SALON = "salon";

const schemaTexte = z.string().trim().min(1, "message vide").max(500, "500 caractères maximum");
const schemaMessage = z.strictObject({ texte: schemaTexte });
const schemaAnnonce = z.strictObject({
  type: z.enum(["cherche", "propose"]),
  code: z.string().regex(/^[a-z0-9-]{3,40}$/),
  foil: z.boolean(),
  note: z.string().trim().max(140).optional(),
});
const schemaApres = z.coerce.number().int().min(0).optional();

function moi(c: Context<ContexteApi>): CompteConnecte {
  const compte = c.get("compte");
  if (!compte) throw new Error("compte absent après exigerConnexion");
  return compte;
}

const estModerateur = (compte: CompteConnecte) => compte.role === "admin" && compte.adminJusqua > Date.now();

/** Identifiant stable d'une conversation privée entre deux comptes. */
const conversationPrivee = (a: number, b: number) => `p:${Math.min(a, b)}:${Math.max(a, b)}`;

/**
 * Anti-spam : 20 messages ou annonces par minute, et 500 par jour, par compte.
 * Le plafond journalier protège le quota gratuit d'écritures D1. Comptage atomique (résiste aux envois simultanés).
 */
async function antiSpam(c: Context<ContexteApi>): Promise<Response | null> {
  const base = c.env.BASE_DE_DONNEES;
  const id = moi(c).id;
  const refus = () => c.json({ erreur: "trop_de_messages" }, 429);
  if (!(await compterTentative(base, `messages:compte:${id}`, REGLES.messagesParCompte)).autorisee) return refus();
  if (!(await compterTentative(base, `messages-jour:compte:${id}`, REGLES.messagesParJour)).autorisee) return refus();
  return null;
}

async function cartesParCode(): Promise<Map<string, CarteCatalogue>> {
  return new Map((await obtenirCatalogue()).cartes.map((carte) => [carte.code, carte]));
}

// ---------- Annonces ----------

interface LigneAnnonce {
  id: number;
  compte_id: number;
  auteur: string;
  type: "cherche" | "propose";
  card_code: string;
  est_foil: number;
  note: string | null;
  cree_le: number;
}

routesMarche.get("/annonces", async (c) => {
  const compte = moi(c);
  const base = c.env.BASE_DE_DONNEES;
  const filtres = z
    .object({ set: z.string().regex(/^[a-z]{2,5}$/).optional(), recherche: z.string().trim().max(50).optional() })
    .safeParse(c.req.query());
  if (!filtres.success) return c.json({ erreur: "donnees_invalides" }, 400);

  // « Qui veut ? » : masquée si l'auteur n'a plus la carte (échangée, collection vidée…).
  const { results } = await base
    .prepare(
      `SELECT a.id, a.compte_id, c.pseudo AS auteur, a.type, a.card_code, a.est_foil, a.note, a.cree_le
       FROM annonces a JOIN comptes c ON c.id = a.compte_id
       WHERE a.retiree_le IS NULL AND a.expire_le > ? AND c.actif = 1
         AND (a.type = 'cherche' OR EXISTS (
           SELECT 1 FROM collection x WHERE x.compte_id = a.compte_id AND x.card_code = a.card_code
             AND x.est_foil = a.est_foil AND x.quantite > 0))
       ORDER BY a.id DESC LIMIT 300`,
    )
    .bind(Date.now())
    .all<LigneAnnonce>();

  // Ce que je possède : « Tu l'as » sur les recherches des autres (je peux aider), « Déjà ×n » sur les offres.
  const { results: miennes } = await base
    .prepare("SELECT card_code, SUM(quantite) AS n FROM collection WHERE compte_id = ? AND quantite > 0 GROUP BY card_code")
    .bind(compte.id)
    .all<{ card_code: string; n: number }>();
  const possede = new Map(miennes.map((r) => [r.card_code, r.n]));

  const parCode = await cartesParCode();
  const { set, recherche } = filtres.data;
  const mots = recherche ? sansAccents(recherche).split(/\s+/).filter(Boolean) : [];
  const annonces = results
    .map((a) => ({ ligne: a, carte: parCode.get(a.card_code) ?? null }))
    .filter(({ carte }) => {
      if (!carte) return false;
      if (set && carte.set !== set) return false;
      if (mots.length) {
        const texte = sansAccents(`${carte.nom} ${carte.sousTitre ?? ""} ${carte.type} ${carte.numero}`);
        if (!mots.every((m) => texte.includes(m))) return false;
      }
      return true;
    })
    .map(({ ligne: a, carte }) => ({
      id: a.id,
      type: a.type,
      auteur: a.auteur,
      estMoi: a.compte_id === compte.id,
      foil: a.est_foil === 1,
      note: a.note,
      creeLe: a.cree_le,
      carte,
      jePossede: possede.get(a.card_code) ?? 0,
    }));
  return c.json({ annonces, peutModerer: estModerateur(compte) });
});

routesMarche.post("/annonces", async (c) => {
  const compte = moi(c);
  const base = c.env.BASE_DE_DONNEES;
  const lecture = await lireCorps(c, schemaAnnonce);
  if (!lecture.ok) return lecture.reponse;
  const { type, code, foil, note } = lecture.donnees;

  const carte = (await cartesParCode()).get(code);
  if (!carte) return c.json({ erreur: "carte_introuvable" }, 404);

  const maintenant = Date.now();
  const actives = await base
    .prepare("SELECT COUNT(*) AS n FROM annonces WHERE compte_id = ? AND retiree_le IS NULL AND expire_le > ?")
    .bind(compte.id, maintenant)
    .first<{ n: number }>();
  if ((actives?.n ?? 0) >= MAX_ANNONCES_ACTIVES) return c.json({ erreur: "trop_d_annonces" }, 409);

  if (type === "propose") {
    const stock = await base
      .prepare("SELECT quantite FROM collection WHERE compte_id = ? AND card_code = ? AND est_foil = ?")
      .bind(compte.id, code, foil ? 1 : 0)
      .first<{ quantite: number }>();
    if (!stock || stock.quantite < 1) return c.json({ erreur: "cartes_non_possedees" }, 409);
  }

  const doublon = await base
    .prepare(
      "SELECT 1 AS present FROM annonces WHERE compte_id = ? AND type = ? AND card_code = ? AND est_foil = ? AND retiree_le IS NULL AND expire_le > ?",
    )
    .bind(compte.id, type, code, foil ? 1 : 0, maintenant)
    .first();
  if (doublon) return c.json({ erreur: "annonce_en_double" }, 409);

  const bloque = await antiSpam(c);
  if (bloque) return bloque;

  const annonce = await base
    .prepare(
      "INSERT INTO annonces (compte_id, type, card_code, est_foil, note, cree_le, expire_le) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(compte.id, type, code, foil ? 1 : 0, note || null, maintenant, maintenant + DUREE_ANNONCE_MS)
    .first<{ id: number }>();
  if (!annonce) throw new Error("annonce non créée");
  // L'annonce est aussi publiée dans le salon, avec la carte à côté.
  await base
    .prepare("INSERT INTO messages (conversation, expediteur_id, texte, annonce_id, cree_le) VALUES (?, ?, ?, ?, ?)")
    .bind(SALON, compte.id, note ?? "", annonce.id, maintenant)
    .run();
  return c.json({ id: annonce.id }, 201);
});

routesMarche.delete("/annonces/:id", async (c) => {
  const compte = moi(c);
  const id = schemaIdentifiant.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ erreur: "introuvable" }, 404);
  const maj = await c.env.BASE_DE_DONNEES.prepare(
    "UPDATE annonces SET retiree_le = ? WHERE id = ? AND retiree_le IS NULL AND (compte_id = ? OR ? = 1)",
  )
    .bind(Date.now(), id.data, compte.id, estModerateur(compte) ? 1 : 0)
    .run();
  if (!maj.meta.changes) return c.json({ erreur: "introuvable" }, 404);
  return c.json({ ok: true });
});

// ---------- Messages ----------

interface LigneMessage {
  id: number;
  expediteur_id: number;
  auteur: string;
  texte: string;
  cree_le: number;
  annonce_id: number | null;
  annonce_type: "cherche" | "propose" | null;
  annonce_code: string | null;
  annonce_foil: number | null;
  annonce_active: number | null;
}

// Les deux requêtes ci-dessous sont écrites en entier (règle du projet : SQL littéral uniquement dans .prepare()).


/**
 * Messages d'une conversation : les 50 derniers, ou seulement les nouveaux (`apres` = dernier id connu, pour le
 * rafraîchissement automatique). Marque la conversation comme lue jusqu'au dernier message renvoyé.
 */
async function lireConversation(c: Context<ContexteApi>, conversation: string) {
  const compte = moi(c);
  const base = c.env.BASE_DE_DONNEES;
  const apres = schemaApres.safeParse(c.req.query("apres"));
  if (!apres.success) return c.json({ erreur: "donnees_invalides" }, 400);
  const maintenant = Date.now();

  const lignes =
    apres.data !== undefined
      ? (
          await base
            .prepare(
              `SELECT m.id, m.expediteur_id, c.pseudo AS auteur, m.texte, m.cree_le, m.annonce_id,
                      a.type AS annonce_type, a.card_code AS annonce_code, a.est_foil AS annonce_foil,
                      CASE WHEN a.id IS NOT NULL AND a.retiree_le IS NULL AND a.expire_le > ? THEN 1 ELSE 0 END AS annonce_active
               FROM messages m JOIN comptes c ON c.id = m.expediteur_id LEFT JOIN annonces a ON a.id = m.annonce_id
               WHERE m.conversation = ? AND m.id > ? AND m.supprime_le IS NULL ORDER BY m.id ASC LIMIT 100`,
            )
            .bind(maintenant, conversation, apres.data)
            .all<LigneMessage>()
        ).results
      : (
          await base
            .prepare(
              `SELECT m.id, m.expediteur_id, c.pseudo AS auteur, m.texte, m.cree_le, m.annonce_id,
                      a.type AS annonce_type, a.card_code AS annonce_code, a.est_foil AS annonce_foil,
                      CASE WHEN a.id IS NOT NULL AND a.retiree_le IS NULL AND a.expire_le > ? THEN 1 ELSE 0 END AS annonce_active
               FROM messages m JOIN comptes c ON c.id = m.expediteur_id LEFT JOIN annonces a ON a.id = m.annonce_id
               WHERE m.conversation = ? AND m.supprime_le IS NULL ORDER BY m.id DESC LIMIT ?`,
            )
            .bind(maintenant, conversation, MESSAGES_PAR_PAGE)
            .all<LigneMessage>()
        ).results.reverse();

  const dernier = lignes.at(-1)?.id;
  if (dernier !== undefined) {
    await base
      .prepare(
        `INSERT INTO lectures (compte_id, conversation, dernier_lu) VALUES (?, ?, ?)
         ON CONFLICT (compte_id, conversation) DO UPDATE SET dernier_lu = MAX(dernier_lu, excluded.dernier_lu)`,
      )
      .bind(compte.id, conversation, dernier)
      .run();
  }

  const parCode = lignes.some((l) => l.annonce_code) ? await cartesParCode() : new Map<string, CarteCatalogue>();
  const moderateur = estModerateur(compte);
  return c.json({
    messages: lignes.map((l) => ({
      id: l.id,
      auteur: l.auteur,
      estMoi: l.expediteur_id === compte.id,
      peutSupprimer: l.expediteur_id === compte.id || moderateur,
      texte: l.texte,
      creeLe: l.cree_le,
      annonce:
        l.annonce_id && l.annonce_code && l.annonce_type
          ? {
              id: l.annonce_id,
              type: l.annonce_type,
              foil: l.annonce_foil === 1,
              active: l.annonce_active === 1,
              carte: parCode.get(l.annonce_code) ?? null,
            }
          : null,
    })),
  });
}

async function joueurParPseudo(c: Context<ContexteApi>): Promise<{ id: number; pseudo: string } | null> {
  const pseudo = schemaPseudo.safeParse(c.req.param("pseudo"));
  if (!pseudo.success) return null;
  const joueur = await c.env.BASE_DE_DONNEES.prepare("SELECT id, pseudo FROM comptes WHERE pseudo = ? AND actif = 1")
    .bind(pseudo.data)
    .first<{ id: number; pseudo: string }>();
  return joueur && joueur.id !== moi(c).id ? joueur : null;
}

routesMarche.get("/salon", (c) => lireConversation(c, SALON));

routesMarche.post("/salon", async (c) => {
  const lecture = await lireCorps(c, schemaMessage);
  if (!lecture.ok) return lecture.reponse;
  const bloque = await antiSpam(c);
  if (bloque) return bloque;
  const ligne = await c.env.BASE_DE_DONNEES.prepare(
    "INSERT INTO messages (conversation, expediteur_id, texte, cree_le) VALUES (?, ?, ?, ?) RETURNING id",
  )
    .bind(SALON, moi(c).id, lecture.donnees.texte, Date.now())
    .first<{ id: number }>();
  return c.json({ id: ligne?.id }, 201);
});

routesMarche.get("/prive/:pseudo", async (c) => {
  const joueur = await joueurParPseudo(c);
  if (!joueur) return c.json({ erreur: "joueur_introuvable" }, 404);
  return lireConversation(c, conversationPrivee(moi(c).id, joueur.id));
});

routesMarche.post("/prive/:pseudo", async (c) => {
  const joueur = await joueurParPseudo(c);
  if (!joueur) return c.json({ erreur: "joueur_introuvable" }, 404);
  const lecture = await lireCorps(c, schemaMessage);
  if (!lecture.ok) return lecture.reponse;
  const bloque = await antiSpam(c);
  if (bloque) return bloque;
  const compte = moi(c);
  const ligne = await c.env.BASE_DE_DONNEES.prepare(
    "INSERT INTO messages (conversation, expediteur_id, destinataire_id, texte, cree_le) VALUES (?, ?, ?, ?, ?) RETURNING id",
  )
    .bind(conversationPrivee(compte.id, joueur.id), compte.id, joueur.id, lecture.donnees.texte, Date.now())
    .first<{ id: number }>();
  return c.json({ id: ligne?.id }, 201);
});

routesMarche.delete("/messages/:id", async (c) => {
  const compte = moi(c);
  const id = schemaIdentifiant.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ erreur: "introuvable" }, 404);
  const maj = await c.env.BASE_DE_DONNEES.prepare(
    "UPDATE messages SET supprime_le = ? WHERE id = ? AND supprime_le IS NULL AND (expediteur_id = ? OR ? = 1)",
  )
    .bind(Date.now(), id.data, compte.id, estModerateur(compte) ? 1 : 0)
    .run();
  if (!maj.meta.changes) return c.json({ erreur: "introuvable" }, 404);
  return c.json({ ok: true });
});

/** Mes conversations privées, la plus récente d'abord, avec le dernier message et le nombre de non lus. */
routesMarche.get("/conversations", async (c) => {
  const compte = moi(c);
  const { results } = await c.env.BASE_DE_DONNEES.prepare(
    `SELECT m.conversation, m.texte, m.cree_le AS creeLe, m.expediteur_id AS expediteurId, c.pseudo AS avec,
            (SELECT COUNT(*) FROM messages x
              WHERE x.conversation = m.conversation AND x.destinataire_id = ? AND x.supprime_le IS NULL
                AND x.id > COALESCE((SELECT l.dernier_lu FROM lectures l WHERE l.compte_id = ? AND l.conversation = m.conversation), 0)
            ) AS nonLus
     FROM messages m
     JOIN comptes c ON c.id = CASE WHEN m.expediteur_id = ? THEN m.destinataire_id ELSE m.expediteur_id END
     WHERE m.id IN (
       SELECT MAX(id) FROM messages
       WHERE (expediteur_id = ? OR destinataire_id = ?) AND conversation <> 'salon' AND supprime_le IS NULL
       GROUP BY conversation)
     ORDER BY m.id DESC LIMIT 50`,
  )
    .bind(compte.id, compte.id, compte.id, compte.id, compte.id)
    .all<{ conversation: string; texte: string; creeLe: number; expediteurId: number; avec: string; nonLus: number }>();
  return c.json({
    conversations: results.map((r) => ({
      avec: r.avec,
      dernierMessage: r.texte,
      deMoi: r.expediteurId === compte.id,
      creeLe: r.creeLe,
      nonLus: r.nonLus,
    })),
  });
});

/** Pastilles de la navigation : messages non lus dans le salon et en privé. */
routesMarche.get("/non-lus", async (c) => {
  const compte = moi(c);
  const ligne = await c.env.BASE_DE_DONNEES.prepare(
    `SELECT
       (SELECT COUNT(*) FROM messages m
         WHERE m.conversation = 'salon' AND m.expediteur_id <> ? AND m.supprime_le IS NULL
           AND m.id > COALESCE((SELECT dernier_lu FROM lectures WHERE compte_id = ? AND conversation = 'salon'), 0)) AS salon,
       (SELECT COUNT(*) FROM messages m
         WHERE m.destinataire_id = ? AND m.supprime_le IS NULL
           AND m.id > COALESCE((SELECT l.dernier_lu FROM lectures l WHERE l.compte_id = ? AND l.conversation = m.conversation), 0)) AS prive`,
  )
    .bind(compte.id, compte.id, compte.id, compte.id)
    .first<{ salon: number; prive: number }>();
  return c.json({ salon: ligne?.salon ?? 0, prive: ligne?.prive ?? 0 });
});
