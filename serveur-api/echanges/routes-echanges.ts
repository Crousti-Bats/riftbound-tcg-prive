/**
 * Routes /api/echanges : proposer, accepter, refuser, annuler des échanges de cartes entre joueurs.
 *
 * Sécurité et intégrité :
 * - Toutes les vérifications se font côté serveur : un joueur ne peut ni donner une carte qu'il n'a pas,
 *   ni accepter un échange qui ne lui est pas adressé, ni l'accepter deux fois.
 * - L'acceptation est UN SEUL lot D1 (transaction) : réservation de l'échange + tous les transferts.
 *   Si une carte manque au moment d'accepter, la contrainte CHECK (quantite >= 0) fait échouer le lot
 *   et TOUT est annulé : aucune carte n'est créée ni perdue.
 */
import { type Context, Hono } from "hono";
import { exigerConnexion } from "../authentification/sessions";
import { obtenirCatalogue } from "../catalogue/source-cartes";
import type { CarteCatalogue } from "../catalogue/types-catalogue";
import { jetonAleatoire } from "../securite/jetons-et-empreintes";
import { lireCorps } from "../lecture-requete";
import type { ContexteApi } from "../types-application";
import { schemaIdentifiant } from "../validation-donnees";
import {
  DUREE_VALIDITE_MS,
  estErreurStockInsuffisant,
  type LigneEchange,
  MAX_PROPOSITIONS_EN_ATTENTE,
  schemaProposition,
  type Sens,
  type StatutEchange,
} from "./regles-echanges";

export const routesEchanges = new Hono<ContexteApi>();

routesEchanges.use("*", exigerConnexion);

interface LigneEchangeBase {
  echange_id: number;
  sens: Sens;
  card_code: string;
  est_foil: number;
  quantite: number;
}

interface EchangeBase {
  id: number;
  auteur_id: number;
  destinataire_id: number;
  auteur: string;
  destinataire: string;
  statut: StatutEchange;
  message: string | null;
  cree_le: number;
  expire_le: number;
  termine_le: number | null;
}

function idCompte(c: Context<ContexteApi>): number {
  const compte = c.get("compte");
  if (!compte) throw new Error("compte absent après exigerConnexion");
  return compte.id;
}

/** Passe en « expiré » les propositions en attente dépassées (expiration paresseuse, sans tâche planifiée). */
async function expirerPropositions(base: D1Database, compteId: number): Promise<void> {
  const maintenant = Date.now();
  await base
    .prepare(
      `UPDATE echanges SET statut = 'expire', termine_le = expire_le
       WHERE statut = 'en_attente' AND expire_le <= ? AND (auteur_id = ? OR destinataire_id = ?)`,
    )
    .bind(maintenant, compteId, compteId)
    .run();
}

/** Vérifie qu'un compte possède toutes les cartes demandées. Renvoie les lignes manquantes. */
async function lignesManquantes(base: D1Database, compteId: number, lignes: LigneEchange[]): Promise<LigneEchange[]> {
  if (lignes.length === 0) return [];
  const { results } = await base
    .prepare("SELECT card_code, est_foil, quantite FROM collection WHERE compte_id = ? AND quantite > 0")
    .bind(compteId)
    .all<{ card_code: string; est_foil: number; quantite: number }>();
  const possede = new Map(results.map((r) => [`${r.card_code}|${r.est_foil}`, r.quantite]));
  return lignes.filter((l) => (possede.get(`${l.code}|${l.foil ? 1 : 0}`) ?? 0) < l.quantite);
}

/** Ajoute aux lignes les données de carte du catalogue (nom, image, rareté…) pour l'affichage. */
function enrichir(lignes: LigneEchangeBase[], parCode: Map<string, CarteCatalogue>) {
  return lignes.map((l) => ({
    sens: l.sens,
    code: l.card_code,
    foil: l.est_foil === 1,
    quantite: l.quantite,
    carte: parCode.get(l.card_code) ?? null,
  }));
}

// ---------- Joueurs ----------

routesEchanges.get("/joueurs", async (c) => {
  const { results } = await c.env.BASE_DE_DONNEES.prepare(
    "SELECT pseudo FROM comptes WHERE actif = 1 AND id <> ? ORDER BY pseudo COLLATE NOCASE",
  )
    .bind(idCompte(c))
    .all<{ pseudo: string }>();
  return c.json({ joueurs: results.map((r) => r.pseudo) });
});

// ---------- Créer une proposition ----------

routesEchanges.post("/", async (c) => {
  const moi = idCompte(c);
  const base = c.env.BASE_DE_DONNEES;
  const lecture = await lireCorps(c, schemaProposition);
  if (!lecture.ok) return lecture.reponse;
  const { destinataire, donne, demande, message } = lecture.donnees;

  const cible = await base
    .prepare("SELECT id, pseudo FROM comptes WHERE pseudo = ? AND actif = 1")
    .bind(destinataire)
    .first<{ id: number; pseudo: string }>();
  if (!cible) return c.json({ erreur: "joueur_introuvable" }, 404);
  if (cible.id === moi) return c.json({ erreur: "echange_avec_soi" }, 400);

  await expirerPropositions(base, moi);
  const enAttente = await base
    .prepare("SELECT COUNT(*) AS n FROM echanges WHERE auteur_id = ? AND statut = 'en_attente'")
    .bind(moi)
    .first<{ n: number }>();
  if ((enAttente?.n ?? 0) >= MAX_PROPOSITIONS_EN_ATTENTE) return c.json({ erreur: "trop_de_propositions" }, 429);

  const manquantesMoi = await lignesManquantes(base, moi, donne);
  if (manquantesMoi.length) return c.json({ erreur: "cartes_non_possedees", cote: "donne", cartes: manquantesMoi }, 409);
  const manquantesCible = await lignesManquantes(base, cible.id, demande);
  if (manquantesCible.length) return c.json({ erreur: "cartes_non_possedees", cote: "demande", cartes: manquantesCible }, 409);

  const maintenant = Date.now();
  const echange = await base
    .prepare(
      "INSERT INTO echanges (auteur_id, destinataire_id, message, cree_le, expire_le) VALUES (?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(moi, cible.id, message || null, maintenant, maintenant + DUREE_VALIDITE_MS)
    .first<{ id: number }>();
  if (!echange) throw new Error("création de l'échange impossible");

  const insertions = [
    ...donne.map((l) => ({ ...l, sens: "donne" as const })),
    ...demande.map((l) => ({ ...l, sens: "demande" as const })),
  ].map((l) =>
    base
      .prepare("INSERT INTO echanges_cartes (echange_id, sens, card_code, est_foil, quantite) VALUES (?, ?, ?, ?, ?)")
      .bind(echange.id, l.sens, l.code, l.foil ? 1 : 0, l.quantite),
  );
  try {
    await base.batch(insertions);
  } catch (err) {
    await base.prepare("DELETE FROM echanges WHERE id = ?").bind(echange.id).run();
    throw err;
  }
  return c.json({ id: echange.id, expireLe: maintenant + DUREE_VALIDITE_MS }, 201);
});

// ---------- Lister mes échanges ----------

routesEchanges.get("/", async (c) => {
  const moi = idCompte(c);
  const base = c.env.BASE_DE_DONNEES;
  await expirerPropositions(base, moi);

  const { results: echanges } = await base
    .prepare(
      `SELECT e.id, e.auteur_id, e.destinataire_id, a.pseudo AS auteur, d.pseudo AS destinataire, e.statut, e.message,
              e.cree_le, e.expire_le, e.termine_le
       FROM echanges e JOIN comptes a ON a.id = e.auteur_id JOIN comptes d ON d.id = e.destinataire_id
       WHERE e.auteur_id = ? OR e.destinataire_id = ?
       ORDER BY e.id DESC LIMIT 100`,
    )
    .bind(moi, moi)
    .all<EchangeBase>();

  const { results: lignes } = await base
    .prepare(
      `SELECT ec.echange_id, ec.sens, ec.card_code, ec.est_foil, ec.quantite
       FROM echanges_cartes ec
       WHERE ec.echange_id IN (SELECT id FROM echanges WHERE auteur_id = ? OR destinataire_id = ? ORDER BY id DESC LIMIT 100)`,
    )
    .bind(moi, moi)
    .all<LigneEchangeBase>();

  const catalogue = await obtenirCatalogue().catch(() => null);
  const parCode = new Map((catalogue?.cartes ?? []).map((carte) => [carte.code, carte]));
  const lignesParEchange = new Map<number, LigneEchangeBase[]>();
  for (const l of lignes) lignesParEchange.set(l.echange_id, [...(lignesParEchange.get(l.echange_id) ?? []), l]);

  const vue = echanges.map((e) => {
    const cartes = enrichir(lignesParEchange.get(e.id) ?? [], parCode);
    return {
      id: e.id,
      auteur: e.auteur,
      destinataire: e.destinataire,
      jeSuisAuteur: e.auteur_id === moi,
      statut: e.statut,
      message: e.message,
      creeLe: e.cree_le,
      expireLe: e.expire_le,
      termineLe: e.termine_le,
      // Vu par l'auteur : « donne » = ce qu'il donne. Le client inverse l'affichage pour le destinataire.
      donne: cartes.filter((x) => x.sens === "donne"),
      demande: cartes.filter((x) => x.sens === "demande"),
    };
  });

  return c.json({
    recues: vue.filter((e) => !e.jeSuisAuteur && e.statut === "en_attente"),
    envoyees: vue.filter((e) => e.jeSuisAuteur && e.statut === "en_attente"),
    historique: vue.filter((e) => e.statut !== "en_attente").slice(0, 50),
  });
});

/** Nombre de propositions reçues en attente (pour la pastille de l'accueil). */
routesEchanges.get("/resume", async (c) => {
  const moi = idCompte(c);
  const n = await c.env.BASE_DE_DONNEES.prepare(
    "SELECT COUNT(*) AS n FROM echanges WHERE destinataire_id = ? AND statut = 'en_attente' AND expire_le > ?",
  )
    .bind(moi, Date.now())
    .first<{ n: number }>();
  return c.json({ recuesEnAttente: n?.n ?? 0 });
});

// ---------- Accepter ----------

routesEchanges.post("/:id/accepter", async (c) => {
  const moi = idCompte(c);
  const id = schemaIdentifiant.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ erreur: "identifiant_invalide" }, 400);
  const base = c.env.BASE_DE_DONNEES;

  const echange = await base
    .prepare("SELECT id, auteur_id, destinataire_id, statut, expire_le FROM echanges WHERE id = ?")
    .bind(id.data)
    .first<{ id: number; auteur_id: number; destinataire_id: number; statut: StatutEchange; expire_le: number }>();
  if (!echange || echange.destinataire_id !== moi) return c.json({ erreur: "echange_introuvable" }, 404);
  if (echange.statut !== "en_attente") return c.json({ erreur: "echange_deja_traite" }, 409);
  const maintenant = Date.now();
  if (echange.expire_le <= maintenant) {
    await expirerPropositions(base, moi);
    return c.json({ erreur: "echange_expire" }, 410);
  }

  const { results: lignes } = await base
    .prepare("SELECT echange_id, sens, card_code, est_foil, quantite FROM echanges_cartes WHERE echange_id = ?")
    .bind(echange.id)
    .all<LigneEchangeBase>();

  // Chaque transfert porte la garde « EXISTS (… jeton_acceptation = ?) » : il ne s'exécute que si la réservation
  // (étape 1) a réussi DANS CE LOT. Écrite en toutes lettres : la règle ESLint interdit tout SQL assemblé.
  const jeton = jetonAleatoire(16);
  const requetes: D1PreparedStatement[] = [
    // 1. Réservation : ne réussit que si l'échange est toujours en attente et m'est adressé.
    base
      .prepare(
        `UPDATE echanges SET statut = 'accepte', termine_le = ?, jeton_acceptation = ?
         WHERE id = ? AND destinataire_id = ? AND statut = 'en_attente' AND expire_le > ?`,
      )
      .bind(maintenant, jeton, echange.id, moi, maintenant),
  ];
  for (const l of lignes) {
    const donneur = l.sens === "donne" ? echange.auteur_id : echange.destinataire_id;
    const receveur = l.sens === "donne" ? echange.destinataire_id : echange.auteur_id;
    // 2. Retrait chez le donneur. La ligne est créée à 0 si absente, pour que le retrait viole CHECK (quantite >= 0)
    //    s'il ne possède plus la carte : le lot entier est alors annulé.
    requetes.push(
      base
        .prepare(
          `INSERT INTO collection (compte_id, card_code, est_foil, quantite) SELECT ?, ?, ?, 0
           WHERE EXISTS (SELECT 1 FROM echanges WHERE id = ? AND jeton_acceptation = ?)
           ON CONFLICT (compte_id, card_code, est_foil) DO NOTHING`,
        )
        .bind(donneur, l.card_code, l.est_foil, echange.id, jeton),
      base
        .prepare(
          `UPDATE collection SET quantite = quantite - ?
           WHERE compte_id = ? AND card_code = ? AND est_foil = ?
             AND EXISTS (SELECT 1 FROM echanges WHERE id = ? AND jeton_acceptation = ?)`,
        )
        .bind(l.quantite, donneur, l.card_code, l.est_foil, echange.id, jeton),
      // 3. Ajout chez le receveur.
      base
        .prepare(
          `INSERT INTO collection (compte_id, card_code, est_foil, quantite) SELECT ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM echanges WHERE id = ? AND jeton_acceptation = ?)
           ON CONFLICT (compte_id, card_code, est_foil) DO UPDATE SET quantite = quantite + excluded.quantite`,
        )
        .bind(receveur, l.card_code, l.est_foil, l.quantite, echange.id, jeton),
    );
  }
  // 4. Ménage : plus de ligne à 0 dans les collections des deux joueurs.
  requetes.push(
    base
      .prepare("DELETE FROM collection WHERE compte_id IN (?, ?) AND quantite = 0")
      .bind(echange.auteur_id, echange.destinataire_id),
  );

  try {
    await base.batch(requetes);
  } catch (err) {
    if (!estErreurStockInsuffisant(err)) throw err;
    // Le lot a été entièrement annulé. On le signale et on clôt l'échange.
    await base
      .prepare("UPDATE echanges SET statut = 'echoue', termine_le = ? WHERE id = ? AND statut = 'en_attente'")
      .bind(Date.now(), echange.id)
      .run();
    return c.json({ erreur: "cartes_plus_disponibles" }, 409);
  }

  const verif = await base
    .prepare("SELECT jeton_acceptation FROM echanges WHERE id = ?")
    .bind(echange.id)
    .first<{ jeton_acceptation: string | null }>();
  if (verif?.jeton_acceptation !== jeton) return c.json({ erreur: "echange_deja_traite" }, 409);
  return c.json({ ok: true, statut: "accepte" });
});

// ---------- Refuser / annuler ----------

async function cloturer(c: Context<ContexteApi>, statut: "refuse" | "annule") {
  const moi = idCompte(c);
  const id = schemaIdentifiant.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ erreur: "identifiant_invalide" }, 400);
  // Seul le destinataire refuse ; seul l'auteur annule.
  const base = c.env.BASE_DE_DONNEES;
  const requete =
    statut === "refuse"
      ? base.prepare(
          "UPDATE echanges SET statut = 'refuse', termine_le = ? WHERE id = ? AND destinataire_id = ? AND statut = 'en_attente'",
        )
      : base.prepare(
          "UPDATE echanges SET statut = 'annule', termine_le = ? WHERE id = ? AND auteur_id = ? AND statut = 'en_attente'",
        );
  const r = await requete.bind(Date.now(), id.data, moi).run();
  if (!r.meta.changes) return c.json({ erreur: "echange_introuvable_ou_deja_traite" }, 404);
  return c.json({ ok: true, statut });
}

routesEchanges.post("/:id/refuser", (c) => cloturer(c, "refuse"));
routesEchanges.post("/:id/annuler", (c) => cloturer(c, "annule"));
