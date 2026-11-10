/**
 * GET /api/admin/monitoring : tableau de bord admin, interrogé toutes les quelques secondes (polling).
 * Lecture seule : ne prolonge pas l'accès admin et n'écrit rien en base.
 * Toutes les requêtes sont préparées ; les lectures sont regroupées en un seul aller-retour D1 (batch).
 */
import type { Context } from "hono";
import { REGLES, type RegleLimitation } from "../securite/limitation-tentatives";
import { obtenirCatalogue } from "../catalogue/source-cartes";
import type { ContexteApi } from "../types-application";
import { lireQuotas } from "./quotas-cloudflare";

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;
export const SEUIL_EN_LIGNE_MS = 5 * MINUTE;

// Attention : la requête /* 7 */ contient un « ? » par type de cette liste (à garder synchronisés).
const EVENEMENTS_SECURITE = ["connexion_echouee", "connexion_bloquee", "inscription_refusee", "reinitialisation_refusee", "elevation_echouee"];

/** Règle de limitation correspondant à une clé de la table `limitations`. */
function regleDeLaCle(cle: string): RegleLimitation | null {
  if (cle.startsWith("connexion:ip:")) return REGLES.connexionParIp;
  if (cle.startsWith("connexion:pseudo:")) return REGLES.connexionParPseudo;
  if (cle.startsWith("inscription:ip:")) return REGLES.inscriptionParIp;
  if (cle.startsWith("reinitialisation:ip:")) return REGLES.reinitialisationParIp;
  if (cle.startsWith("elevation:compte:")) return REGLES.elevationAdmin;
  if (cle.startsWith("messages:compte:")) return REGLES.messagesParCompte;
  return null;
}

const FENETRE_MAX_MS = Math.max(...Object.values(REGLES).map((r) => r.fenetreMs));

type Ligne = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

export async function collecterMonitoring(c: Context<ContexteApi>) {
  const base = c.env.BASE_DE_DONNEES;
  const maintenant = Date.now();
  const ilYa1h = maintenant - HEURE;
  const ilYa24h = maintenant - JOUR;

  // Santé de la base : temps d'un aller-retour simple.
  const debut = Date.now();
  let baseOk = true;
  try {
    await base.prepare("SELECT 1").first();
  } catch {
    baseOk = false;
  }
  const latenceBaseMs = Date.now() - debut;

  const resultats = baseOk
    ? await base.batch<Ligne>([
        /* 0 */ base
          .prepare(
            `SELECT COUNT(*) AS total, COALESCE(SUM(actif), 0) AS actifs,
                    COALESCE(SUM(CASE WHEN derniere_activite >= ? THEN 1 ELSE 0 END), 0) AS enLigne
             FROM comptes`,
          )
          .bind(maintenant - SEUIL_EN_LIGNE_MS),
        /* 1 */ base
          .prepare(
            `SELECT pseudo, role, actif, derniere_activite AS derniereActivite FROM comptes
             WHERE derniere_activite >= ? ORDER BY derniere_activite DESC LIMIT 50`,
          )
          .bind(ilYa24h),
        /* 2 */ base
          .prepare("SELECT COUNT(*) AS n FROM invitations WHERE utilisee_le IS NULL AND revoquee = 0 AND expire_le > ?")
          .bind(maintenant),
        /* 3 */ base
          .prepare(
            `SELECT COALESCE(SUM(CASE WHEN horodatage >= ? THEN 1 ELSE 0 END), 0) AS derniereHeure, COUNT(*) AS dernieres24h
             FROM ouvertures_boosters WHERE horodatage >= ?`,
          )
          .bind(ilYa1h, ilYa24h),
        /* 4 */ base
          .prepare(
            `SELECT set_code AS setCode, COUNT(*) AS n FROM ouvertures_boosters WHERE horodatage >= ?
             GROUP BY set_code ORDER BY n DESC`,
          )
          .bind(ilYa24h),
        /* 5 */ base
          .prepare(
            `SELECT (SELECT COUNT(*) FROM echanges WHERE cree_le >= ?) AS proposes,
                    (SELECT COUNT(*) FROM echanges WHERE statut = 'accepte' AND termine_le >= ?) AS acceptes,
                    (SELECT COUNT(*) FROM echanges WHERE statut = 'refuse' AND termine_le >= ?) AS refuses,
                    (SELECT COUNT(*) FROM echanges WHERE statut = 'echoue' AND termine_le >= ?) AS echoues,
                    (SELECT COUNT(*) FROM echanges WHERE statut = 'en_attente' AND expire_le > ?) AS enAttente`,
          )
          .bind(ilYa24h, ilYa24h, ilYa24h, ilYa24h, maintenant),
        /* 6 */ base.prepare(
          `SELECT t.card_code AS code, t.est_foil AS foil, t.horodatage, c.pseudo
           FROM tirages_remarquables t JOIN comptes c ON c.id = t.compte_id
           ORDER BY t.id DESC LIMIT 15`,
        ),
        /* 7 */ base
          .prepare(
            `SELECT type, COUNT(*) AS n24h, COALESCE(SUM(CASE WHEN horodatage >= ? THEN 1 ELSE 0 END), 0) AS n1h
             FROM journal WHERE horodatage >= ? AND type IN (?, ?, ?, ?, ?) GROUP BY type`,
          )
          .bind(ilYa1h, ilYa24h, ...EVENEMENTS_SECURITE),
        /* 8 */ base
          .prepare("SELECT cle, nombre, debut_fenetre AS debutFenetre FROM limitations WHERE debut_fenetre > ? ORDER BY debut_fenetre DESC LIMIT 200")
          .bind(maintenant - FENETRE_MAX_MS),
        /* 9 */ base.prepare(
          "SELECT horodatage, methode, chemin, message FROM erreurs_serveur ORDER BY id DESC LIMIT 20",
        ),
        /* 10 */ base.prepare("SELECT COUNT(*) AS n FROM erreurs_serveur WHERE horodatage >= ?").bind(ilYa24h),
      ])
    : null;
  const lignes = (i: number): Ligne[] => resultats?.[i]?.results ?? [];
  const premiere = (i: number): Ligne => lignes(i)[0] ?? {};

  // Catalogue : âge du cache et noms des cartes remarquables (jamais stockés en base).
  let catalogue: Awaited<ReturnType<typeof obtenirCatalogue>> | null = null;
  try {
    catalogue = await obtenirCatalogue();
  } catch {
    catalogue = null;
  }
  const parCode = new Map((catalogue?.cartes ?? []).map((carte) => [carte.code, carte]));

  const blocages = lignes(8).flatMap((l) => {
    const cle = String(l.cle);
    const regle = regleDeLaCle(cle);
    const debutFenetre = n(l.debutFenetre);
    if (!regle || n(l.nombre) < regle.maximum || debutFenetre + regle.fenetreMs <= maintenant) return [];
    return [{ cle, tentatives: n(l.nombre), finBlocage: debutFenetre + regle.fenetreMs }];
  });

  const securite = Object.fromEntries(EVENEMENTS_SECURITE.map((t) => [t, { derniereHeure: 0, dernieres24h: 0 }]));
  for (const l of lignes(7)) securite[String(l.type)] = { derniereHeure: n(l.n1h), dernieres24h: n(l.n24h) };

  const version = (c.env as Partial<Env>).VERSION_DEPLOYEE;

  return {
    genereLe: maintenant,
    joueurs: {
      total: n(premiere(0).total),
      actifs: n(premiere(0).actifs),
      enLigne: n(premiere(0).enLigne),
      seuilEnLigneMs: SEUIL_EN_LIGNE_MS,
      recents: lignes(1).map((l) => ({
        pseudo: String(l.pseudo),
        role: String(l.role),
        actif: n(l.actif) === 1,
        derniereActivite: n(l.derniereActivite),
      })),
      invitationsEnAttente: n(premiere(2).n),
    },
    activite: {
      boosters: {
        derniereHeure: n(premiere(3).derniereHeure),
        dernieres24h: n(premiere(3).dernieres24h),
        parSet24h: lignes(4).map((l) => ({
          set: String(l.setCode),
          nom: catalogue?.sets.find((s) => s.code === l.setCode)?.nom ?? String(l.setCode),
          n: n(l.n),
        })),
      },
      echanges24h: {
        proposes: n(premiere(5).proposes),
        acceptes: n(premiere(5).acceptes),
        refuses: n(premiere(5).refuses),
        echoues: n(premiere(5).echoues),
        enAttente: n(premiere(5).enAttente),
      },
      tiragesRemarquables: lignes(6).map((l) => {
        const carte = parCode.get(String(l.code));
        return {
          code: String(l.code),
          nom: carte ? `${carte.nom}${carte.sousTitre ? `, ${carte.sousTitre}` : ""}` : String(l.code),
          rarete: carte?.rarete ?? null,
          variante: carte?.variante ?? null,
          foil: n(l.foil) === 1,
          pseudo: String(l.pseudo),
          horodatage: n(l.horodatage),
        };
      }),
    },
    securite: {
      evenements: securite,
      blocagesActifs: blocages,
      erreurs24h: n(premiere(10).n),
      dernieresErreurs: lignes(9).map((l) => ({
        horodatage: n(l.horodatage),
        methode: String(l.methode),
        chemin: String(l.chemin),
        message: String(l.message),
      })),
    },
    sante: {
      api: "ok",
      base: baseOk ? "ok" : "injoignable",
      latenceBaseMs,
      catalogue: catalogue
        ? {
            cartes: catalogue.cartes.length,
            chargeLe: catalogue.chargeLe,
            ageMs: maintenant - catalogue.chargeLe,
            miseAJourSource: catalogue.miseAJourSource,
          }
        : null,
      version: version ? { id: version.id, tag: version.tag || null, deployeeLe: version.timestamp || null } : null,
    },
    quotas: await lireQuotas({ idCompte: c.env.ID_COMPTE_CLOUDFLARE, jeton: c.env.JETON_ANALYTICS_CLOUDFLARE }),
  };
}
