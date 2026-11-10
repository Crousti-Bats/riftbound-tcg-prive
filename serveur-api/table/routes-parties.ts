/**
 * Routes /api/parties : le salon de la table de jeu (demandé le 2026-11-10).
 * Je crée une partie avec un de mes decks valides → un code de 8 caractères ; un ami la rejoint avec ce code et
 * son deck ; la partie commence alors dans le Durable Object SalleDeJeu, où l'on joue par WebSocket.
 */
import { Hono } from "hono";
import { z } from "zod";
import { exigerConnexion } from "../authentification/sessions";
import { chargerDeckJouable } from "../decks/routes-decks";
import { lireCorps } from "../lecture-requete";
import { compterTentative, REGLES } from "../securite/limitation-tentatives";
import type { ContexteApi } from "../types-application";

export const routesParties = new Hono<ContexteApi>();

routesParties.use("*", exigerConnexion);

routesParties.onError((err, c) => {
  console.error("table de jeu indisponible", err);
  return c.json({ erreur: "table_indisponible" }, 503);
});

/** Parties en attente ou en cours par joueur (protège le quota des Durable Objects). */
export const MAX_PARTIES_OUVERTES = 5;
/** Alphabet sans caractères ambigus (ni 0/O, ni 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const schemaCode = z.string().regex(/^[A-Z0-9]{8}$/);
/** Un de mes decks (id positif) ou un deck de démo prêté (id négatif, voir decks-demo.ts). */
const schemaDeck = z.strictObject({ deck: z.number().int().min(-99).max(1e12).refine((n) => n !== 0) });

function nouveauCode(): string {
  const octets = new Uint8Array(8);
  crypto.getRandomValues(octets);
  return [...octets].map((o) => ALPHABET[o % ALPHABET.length]).join("");
}

interface LignePartie {
  code: string;
  createur_id: number;
  createur_deck: number;
  invite_id: number | null;
  invite_deck: number | null;
  statut: "attente" | "en_cours" | "terminee";
  cree_le: number;
  createur: string;
  invite: string | null;
}

function lirePartie(base: D1Database, code: string): Promise<LignePartie | null> {
  return base
    .prepare(
      `SELECT p.code, p.createur_id, p.createur_deck, p.invite_id, p.invite_deck, p.statut, p.cree_le,
              c.pseudo AS createur, i.pseudo AS invite
       FROM parties p JOIN comptes c ON c.id = p.createur_id LEFT JOIN comptes i ON i.id = p.invite_id
       WHERE p.code = ?`,
    )
    .bind(code)
    .first<LignePartie>();
}

const resume = (p: LignePartie, moi: number) => ({
  code: p.code,
  statut: p.statut,
  creeLe: p.cree_le,
  createur: p.createur,
  invite: p.invite,
  moi: p.createur_id === moi ? 0 : p.invite_id === moi ? 1 : null,
});

/** Mes parties en attente ou en cours, la plus récente d'abord. */
routesParties.get("/", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const { results } = await c.env.BASE_DE_DONNEES.prepare(
    `SELECT p.code, p.createur_id, p.createur_deck, p.invite_id, p.invite_deck, p.statut, p.cree_le,
            c.pseudo AS createur, i.pseudo AS invite
     FROM parties p JOIN comptes c ON c.id = p.createur_id LEFT JOIN comptes i ON i.id = p.invite_id
     WHERE (p.createur_id = ? OR p.invite_id = ?) AND p.statut <> 'terminee' ORDER BY p.cree_le DESC LIMIT 20`,
  )
    .bind(compte.id, compte.id)
    .all<LignePartie>();
  return c.json({ parties: results.map((p) => resume(p, compte.id)) });
});

routesParties.post("/", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const base = c.env.BASE_DE_DONNEES;
  const lecture = await lireCorps(c, schemaDeck);
  if (!lecture.ok) return lecture.reponse;
  const deck = await chargerDeckJouable(base, compte.id, lecture.donnees.deck);
  if (!deck.ok) return c.json({ erreur: deck.erreur }, 400);
  if (!(await compterTentative(base, `parties:compte:${compte.id}`, REGLES.partiesParCompte)).autorisee) {
    return c.json({ erreur: "trop_de_modifications" }, 429);
  }
  const maintenant = Date.now();
  const code = nouveauCode();
  // Plafond vérifié dans la même requête que l'insertion.
  const ajout = await base
    .prepare(
      `INSERT INTO parties (code, createur_id, createur_deck, statut, cree_le, maj_le)
       SELECT ?, ?, ?, 'attente', ?, ?
       WHERE (SELECT COUNT(*) FROM parties WHERE (createur_id = ? OR invite_id = ?) AND statut <> 'terminee') < ?`,
    )
    .bind(code, compte.id, lecture.donnees.deck, maintenant, maintenant, compte.id, compte.id, MAX_PARTIES_OUVERTES)
    .run();
  if (!ajout.meta.changes) return c.json({ erreur: "trop_de_parties" }, 409);
  return c.json({ code }, 201);
});

routesParties.get("/:code", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const code = schemaCode.safeParse(c.req.param("code"));
  if (!code.success) return c.json({ erreur: "partie_introuvable" }, 404);
  const partie = await lirePartie(c.env.BASE_DE_DONNEES, code.data);
  if (!partie) return c.json({ erreur: "partie_introuvable" }, 404);
  return c.json(resume(partie, compte.id));
});

/** Rejoindre une partie en attente avec un de mes decks : la partie commence aussitôt. */
routesParties.post("/:code/rejoindre", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const base = c.env.BASE_DE_DONNEES;
  const code = schemaCode.safeParse(c.req.param("code"));
  if (!code.success) return c.json({ erreur: "partie_introuvable" }, 404);
  const lecture = await lireCorps(c, schemaDeck);
  if (!lecture.ok) return lecture.reponse;

  const partie = await lirePartie(base, code.data);
  if (!partie) return c.json({ erreur: "partie_introuvable" }, 404);
  if (partie.createur_id === compte.id) return c.json({ erreur: "partie_avec_soi" }, 400);
  if (partie.statut !== "attente") return c.json({ erreur: "partie_deja_commencee" }, 409);

  const [deckCreateur, deckInvite] = await Promise.all([
    chargerDeckJouable(base, partie.createur_id, partie.createur_deck),
    chargerDeckJouable(base, compte.id, lecture.donnees.deck),
  ]);
  if (!deckInvite.ok) return c.json({ erreur: deckInvite.erreur }, 400);
  if (!deckCreateur.ok) return c.json({ erreur: "deck_adverse_incomplet" }, 409);

  // On réserve la place d'abord (une seule personne peut rejoindre), puis on lance la salle.
  const maintenant = Date.now();
  const reservation = await base
    .prepare(
      "UPDATE parties SET invite_id = ?, invite_deck = ?, statut = 'en_cours', maj_le = ? WHERE code = ? AND statut = 'attente' AND invite_id IS NULL",
    )
    .bind(compte.id, lecture.donnees.deck, maintenant, code.data)
    .run();
  if (!reservation.meta.changes) return c.json({ erreur: "partie_deja_commencee" }, 409);

  const salle = c.env.SALLES.get(c.env.SALLES.idFromName(code.data));
  const reponse = await salle.fetch("https://salle/initialiser", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: code.data,
      joueurs: [
        { id: partie.createur_id, pseudo: partie.createur, deck: deckCreateur.deck },
        { id: compte.id, pseudo: compte.pseudo, deck: deckInvite.deck },
      ],
    }),
  });
  if (!reponse.ok) {
    // La salle n'a pas pu démarrer : on rend la place pour pouvoir réessayer.
    await base
      .prepare("UPDATE parties SET invite_id = NULL, invite_deck = NULL, statut = 'attente', maj_le = ? WHERE code = ?")
      .bind(Date.now(), code.data)
      .run();
    return c.json({ erreur: "table_indisponible" }, 503);
  }
  return c.json({ code: code.data });
});

/** Annuler (en attente, créateur) ou quitter (en cours, un des deux joueurs) : la partie est terminée et effacée. */
routesParties.delete("/:code", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const code = schemaCode.safeParse(c.req.param("code"));
  if (!code.success) return c.json({ erreur: "partie_introuvable" }, 404);
  const fin = await c.env.BASE_DE_DONNEES.prepare(
    "UPDATE parties SET statut = 'terminee', maj_le = ? WHERE code = ? AND statut <> 'terminee' AND (createur_id = ? OR invite_id = ?) RETURNING invite_id",
  )
    .bind(Date.now(), code.data, compte.id, compte.id)
    .first<{ invite_id: number | null }>();
  if (!fin) return c.json({ erreur: "partie_introuvable" }, 404);
  if (fin.invite_id !== null) {
    await c.env.SALLES.get(c.env.SALLES.idFromName(code.data)).fetch("https://salle/fin", { method: "POST" });
  }
  return c.json({ ok: true });
});

/**
 * Connexion WebSocket à la table. Le navigateur envoie son cookie de session ; on vérifie l'origine (contre le
 * détournement de WebSocket depuis un autre site) et la participation, puis on passe la main à la salle.
 */
routesParties.get("/:code/ws", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") return c.json({ erreur: "websocket_attendu" }, 426);
  if (c.req.header("Origin") !== new URL(c.req.url).origin) return c.json({ erreur: "origine_refusee" }, 403);
  const code = schemaCode.safeParse(c.req.param("code"));
  if (!code.success) return c.json({ erreur: "partie_introuvable" }, 404);
  const partie = await c.env.BASE_DE_DONNEES.prepare(
    "SELECT statut FROM parties WHERE code = ? AND (createur_id = ? OR invite_id = ?)",
  )
    .bind(code.data, compte.id, compte.id)
    .first<{ statut: string }>();
  if (!partie) return c.json({ erreur: "partie_introuvable" }, 404);
  if (partie.statut !== "en_cours") return c.json({ erreur: "partie_non_commencee" }, 409);

  const salle = c.env.SALLES.get(c.env.SALLES.idFromName(code.data));
  const reponse = await salle.fetch("https://salle/ws", { headers: { Upgrade: "websocket", "X-Table-Joueur": String(compte.id) } });
  // Nouvelle réponse (en-têtes modifiables par les middlewares), avec le WebSocket de la salle.
  return reponse.webSocket ? new Response(null, { status: 101, webSocket: reponse.webSocket }) : reponse;
});
