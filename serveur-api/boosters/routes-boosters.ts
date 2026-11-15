/**
 * Routes /api/boosters : état du stock et ouverture. Réservées aux joueurs connectés.
 * Le tirage est fait côté serveur (aléatoire cryptographique) : le client ne peut pas influencer le résultat.
 */
import { Hono } from "hono";
import { z } from "zod";
import { exigerConnexion } from "../authentification/sessions";
import { obtenirCatalogue } from "../catalogue/source-cartes";
import type { CarteCatalogue } from "../catalogue/types-catalogue";
import { lireCorps } from "../lecture-requete";
import type { ContexteApi } from "../types-application";
import { aleatoireCrypto } from "./aleatoire";
import { carteApercu, cartesManquantes, codesDuBooster, plusRares } from "./apercu-booster";
import { STOCK_MAX } from "./configuration-taux";
import { construirePools } from "./pools";
import { prochainDansMs, regenerer } from "./stock";
import { tirerBooster } from "./tirage-booster";

export const routesBoosters = new Hono<ContexteApi>();

const VARIANTES_REMARQUABLES = new Set(["alt", "overnumbered", "signee", "special", "ultime"]);

/** Epic, Alt Art, Overnumbered, signée, Special, Ultime : ce qu'affiche le monitoring « dernières cartes rares ». */
export function estRemarquable(carte: Pick<CarteCatalogue, "rarete" | "variante">): boolean {
  return carte.rarete === "Epic" || VARIANTES_REMARQUABLES.has(carte.variante);
}

routesBoosters.use("*", exigerConnexion);

// Si le catalogue est injoignable (et rien en cache), on le dit clairement au lieu d'une erreur 500.
routesBoosters.onError((err, c) => {
  console.error("boosters indisponibles", err);
  return c.json({ erreur: "boosters_indisponibles" }, 503);
});

/** Boosters ouverts d'un coup au maximum (« Ouvrir plusieurs », demandé le 2026-11-15). */
export const OUVERTURE_MAX = 20;
const schemaOuverture = z.strictObject({
  set: z.string().regex(/^[a-z]{2,5}$/),
  nombre: z.number().int().min(1).max(OUVERTURE_MAX).optional(),
});

interface LigneStock {
  stock_boosters: number;
  boosters_tick: number;
  /** Boosters offerts : en plus du stock normal, sans régénération ni plafond (migration 0014). */
  boosters_bonus: number;
}

routesBoosters.get("/etat", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const base = c.env.BASE_DE_DONNEES;

  const ligne = await base
    .prepare("SELECT stock_boosters, boosters_tick, boosters_bonus FROM comptes WHERE id = ?")
    .bind(compte.id)
    .first<LigneStock>();
  const maintenant = Date.now();
  const etat = regenerer(ligne?.stock_boosters ?? 0, ligne?.boosters_tick ?? maintenant, maintenant);

  const catalogue = await obtenirCatalogue();
  const sets = catalogue.sets.filter((s) => s.ouvrable).map((s) => ({ code: s.code, nom: s.nom }));

  return c.json({
    stock: {
      actuel: etat.stock,
      max: STOCK_MAX,
      prochainDansMs: prochainDansMs(etat, maintenant),
      offerts: ligne?.boosters_bonus ?? 0,
    },
    sets,
  });
});

const MANQUANTES_PAR_PAGE = 60;
const schemaApercu = z.object({
  set: z.string().regex(/^[a-z]{2,5}$/),
  page: z.coerce.number().int().min(1).max(100).default(1),
});

/**
 * Aperçu d'un booster avant de l'ouvrir : les cartes les plus rares qu'il peut contenir (avec leur chance)
 * et les cartes de ce booster qui me manquent, les plus rares d'abord. Lecture seule.
 */
routesBoosters.get("/apercu", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const filtres = schemaApercu.safeParse(c.req.query());
  if (!filtres.success) return c.json({ erreur: "donnees_invalides" }, 400);
  const { set, page } = filtres.data;

  const catalogue = await obtenirCatalogue();
  const infoSet = catalogue.sets.find((s) => s.code === set);
  const pools = construirePools(catalogue).parSet[set];
  if (!infoSet || !infoSet.ouvrable || !pools) return c.json({ erreur: "set_non_ouvrable" }, 400);

  const base = c.env.BASE_DE_DONNEES;
  const [collection, souhaits] = await base.batch([
    base.prepare("SELECT card_code, est_foil, quantite FROM collection WHERE compte_id = ? AND quantite > 0").bind(compte.id),
    base.prepare("SELECT card_code FROM wishlist WHERE compte_id = ?").bind(compte.id),
  ]);
  const possession = new Map<string, { normale: number; foil: number }>();
  for (const l of collection?.results as Array<{ card_code: string; est_foil: number; quantite: number }>) {
    const p = possession.get(l.card_code) ?? { normale: 0, foil: 0 };
    if (l.est_foil) p.foil += l.quantite;
    else p.normale += l.quantite;
    possession.set(l.card_code, p);
  }
  const wishlist = new Set((souhaits?.results as Array<{ card_code: string }>).map((s) => s.card_code));
  const parCode = new Map(catalogue.cartes.map((carte) => [carte.code, carte]));
  const enrichir = (codes: string[]) =>
    codes.flatMap((code) => {
      const carte = parCode.get(code);
      return carte ? [carteApercu(carte, possession, wishlist)] : [];
    });

  const { total, manquantes } = cartesManquantes(pools, new Set(possession.keys()));
  const debut = (page - 1) * MANQUANTES_PAR_PAGE;
  return c.json({
    set,
    plusRares: plusRares(pools).map((g) => ({ categorie: g.categorie, unBoosterSur: g.unBoosterSur, cartes: enrichir(g.codes) })),
    manquantes: {
      total,
      possedees: total - manquantes.length,
      nombre: manquantes.length,
      page,
      parPage: MANQUANTES_PAR_PAGE,
      cartes: enrichir(manquantes.slice(debut, debut + MANQUANTES_PAR_PAGE)),
    },
  });
});

/**
 * Cœurs sur les boosters : pour chaque set ouvrable, le nombre de cartes de ma wishlist que je n'ai pas encore
 * et que ce booster peut contenir.
 */
routesBoosters.get("/wishlist", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const { results } = await c.env.BASE_DE_DONNEES.prepare(
    `SELECT w.card_code FROM wishlist w
     WHERE w.compte_id = ?
       AND NOT EXISTS (SELECT 1 FROM collection x WHERE x.compte_id = w.compte_id AND x.card_code = w.card_code AND x.quantite > 0)`,
  )
    .bind(compte.id)
    .all<{ card_code: string }>();
  const catalogue = await obtenirCatalogue();
  const pools = construirePools(catalogue);
  const parSet: Record<string, number> = {};
  for (const s of catalogue.sets) {
    const poolsSet = pools.parSet[s.code];
    if (!s.ouvrable || !poolsSet) continue;
    const codes = codesDuBooster(poolsSet);
    parSet[s.code] = results.filter((r) => codes.has(r.card_code)).length;
  }
  return c.json({ parSet });
});

routesBoosters.post("/ouvrir", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const base = c.env.BASE_DE_DONNEES;

  const lecture = await lireCorps(c, schemaOuverture);
  if (!lecture.ok) return lecture.reponse;
  const { set } = lecture.donnees;
  const nombre = lecture.donnees.nombre ?? 1;

  const catalogue = await obtenirCatalogue();
  const infoSet = catalogue.sets.find((s) => s.code === set);
  if (!infoSet || !infoSet.ouvrable) return c.json({ erreur: "set_non_ouvrable" }, 400);

  const ligne = await base
    .prepare("SELECT stock_boosters, boosters_tick, boosters_bonus FROM comptes WHERE id = ?")
    .bind(compte.id)
    .first<LigneStock>();
  const maintenant = Date.now();
  const etat = regenerer(ligne?.stock_boosters ?? 0, ligne?.boosters_tick ?? maintenant, maintenant);
  const offerts = ligne?.boosters_bonus ?? 0;
  if (etat.stock + offerts < 1) {
    return c.json({ erreur: "aucun_booster", prochainDansMs: prochainDansMs(etat, maintenant) }, 409);
  }
  if (etat.stock + offerts < nombre) {
    return c.json({ erreur: "pas_assez_de_boosters", disponibles: etat.stock + offerts }, 409);
  }

  // Le stock normal passe en premier (le minuteur repart aussitôt) ; les boosters offerts ensuite.
  const parStockNormal = Math.min(nombre, etat.stock);
  const parOfferts = nombre - parStockNormal;
  const nouvelEtat = { stock: etat.stock - parStockNormal, tick: etat.tick };

  // Décrément protégé (concurrence optimiste) : on n'écrit que si la ligne n'a pas bougé depuis la lecture.
  // Ainsi deux ouvertures simultanées ne peuvent pas consommer les mêmes boosters deux fois.
  const decrement = await base
    .prepare(
      `UPDATE comptes SET stock_boosters = ?, boosters_tick = ?, boosters_bonus = ?
       WHERE id = ? AND stock_boosters = ? AND boosters_tick = ? AND boosters_bonus = ?`,
    )
    .bind(
      nouvelEtat.stock,
      nouvelEtat.tick,
      offerts - parOfferts,
      compte.id,
      ligne?.stock_boosters ?? 0,
      ligne?.boosters_tick ?? maintenant,
      offerts,
    )
    .run();
  if (decrement.meta.changes !== 1) {
    // Une autre ouverture a modifié le stock entre-temps : on demande de réessayer (aucune carte n'a été ajoutée).
    return c.json({ erreur: "conflit_ouverture" }, 409);
  }

  // Le décrément est acquis : on tire les cartes et on les ajoute à la collection de façon atomique.
  // Quel que soit le nombre de boosters, le lot fait au plus 4 requêtes (json_each) : D1 limite le nombre de
  // requêtes par appel, et 20 boosters de 14 cartes en feraient 280 une par une.
  const pools = construirePools(catalogue);
  const alea = aleatoireCrypto();
  const boosters = Array.from({ length: nombre }, () => tirerBooster(pools, set, alea));
  const tirees = boosters.flat();

  const quantites = new Map<string, [string, 0 | 1, number]>();
  for (const t of tirees) {
    const cle = `${t.code}|${t.foil ? 1 : 0}`;
    const ligneQuantite = quantites.get(cle) ?? [t.code, t.foil ? 1 : 0, 0];
    ligneQuantite[2] += 1;
    quantites.set(cle, ligneQuantite);
  }
  const requetes = [
    base
      .prepare(
        // « WHERE true » : sans lui, SQLite confond le ON de l'upsert avec une jointure (INSERT … SELECT … ON CONFLICT).
        `INSERT INTO collection (compte_id, card_code, est_foil, quantite)
         SELECT ?1, json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]') FROM json_each(?2) WHERE true
         ON CONFLICT (compte_id, card_code, est_foil) DO UPDATE SET quantite = quantite + excluded.quantite`,
      )
      .bind(compte.id, JSON.stringify([...quantites.values()])),
    // Les cartes obtenues quittent ma wishlist (une seule requête pour tous les boosters).
    base
      .prepare("DELETE FROM wishlist WHERE compte_id = ? AND card_code IN (SELECT value FROM json_each(?))")
      .bind(compte.id, JSON.stringify([...new Set(tirees.map((t) => t.code))])),
    // Une ligne par booster ouvert (statistiques du profil et du monitoring).
    base
      .prepare("INSERT INTO ouvertures_boosters (compte_id, set_code, horodatage) SELECT ?1, ?2, ?3 FROM json_each(?4)")
      .bind(compte.id, set, maintenant, JSON.stringify(boosters.map((_, i) => i))),
  ];
  // Cartes remarquables (Epic et au-delà) : tracées pour le monitoring admin, dans le même lot atomique.
  const parCode = new Map(catalogue.cartes.map((carte) => [carte.code, carte]));
  const remarquables = tirees.filter((t) => {
    const carte = parCode.get(t.code);
    return carte && estRemarquable(carte);
  });
  if (remarquables.length) {
    requetes.push(
      base
        .prepare(
          `INSERT INTO tirages_remarquables (compte_id, card_code, est_foil, horodatage)
           SELECT ?1, json_extract(value, '$[0]'), json_extract(value, '$[1]'), ?2 FROM json_each(?3)`,
        )
        .bind(compte.id, maintenant, JSON.stringify(remarquables.map((t) => [t.code, t.foil ? 1 : 0]))),
    );
  }
  await base.batch(requetes);

  // Enrichissement pour l'affichage (données de carte issues du catalogue, jamais de la base).
  // La fiche de carte du site lit tous les champs (domaines, texte, énergie…) : on renvoie la carte complète,
  // exactement comme le catalogue et la collection, plus le foil et le slot du tirage.
  const enrichir = (booster: typeof tirees) =>
    booster.flatMap((t) => {
      const carte = parCode.get(t.code);
      return carte ? [{ ...carte, foil: t.foil, slot: t.slot }] : [];
    });
  const parBooster = boosters.map(enrichir);

  return c.json({
    set,
    /** Les cartes de tous les boosters, à la suite (un seul booster : ses 14 cartes). */
    cartes: parBooster.flat(),
    /** Les cartes booster par booster. */
    boosters: parBooster,
    stock: {
      actuel: nouvelEtat.stock,
      max: STOCK_MAX,
      prochainDansMs: prochainDansMs(nouvelEtat, maintenant),
      offerts: offerts - parOfferts,
    },
  });
});
