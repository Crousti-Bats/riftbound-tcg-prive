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

const schemaOuverture = z.strictObject({ set: z.string().regex(/^[a-z]{2,5}$/) });

interface LigneStock {
  stock_boosters: number;
  boosters_tick: number;
}

routesBoosters.get("/etat", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const base = c.env.BASE_DE_DONNEES;

  const ligne = await base
    .prepare("SELECT stock_boosters, boosters_tick FROM comptes WHERE id = ?")
    .bind(compte.id)
    .first<LigneStock>();
  const maintenant = Date.now();
  const etat = regenerer(ligne?.stock_boosters ?? 0, ligne?.boosters_tick ?? maintenant, maintenant);

  const catalogue = await obtenirCatalogue();
  const sets = catalogue.sets.filter((s) => s.ouvrable).map((s) => ({ code: s.code, nom: s.nom }));

  return c.json({
    stock: { actuel: etat.stock, max: STOCK_MAX, prochainDansMs: prochainDansMs(etat, maintenant) },
    sets,
  });
});

routesBoosters.post("/ouvrir", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const base = c.env.BASE_DE_DONNEES;

  const lecture = await lireCorps(c, schemaOuverture);
  if (!lecture.ok) return lecture.reponse;
  const { set } = lecture.donnees;

  const catalogue = await obtenirCatalogue();
  const infoSet = catalogue.sets.find((s) => s.code === set);
  if (!infoSet || !infoSet.ouvrable) return c.json({ erreur: "set_non_ouvrable" }, 400);

  const ligne = await base
    .prepare("SELECT stock_boosters, boosters_tick FROM comptes WHERE id = ?")
    .bind(compte.id)
    .first<LigneStock>();
  const maintenant = Date.now();
  const etat = regenerer(ligne?.stock_boosters ?? 0, ligne?.boosters_tick ?? maintenant, maintenant);
  if (etat.stock < 1) {
    return c.json({ erreur: "aucun_booster", prochainDansMs: prochainDansMs(etat, maintenant) }, 409);
  }

  // Décrément protégé (concurrence optimiste) : on n'écrit que si la ligne n'a pas bougé depuis la lecture.
  // Ainsi deux ouvertures simultanées ne peuvent pas consommer un seul booster deux fois.
  const decrement = await base
    .prepare(
      "UPDATE comptes SET stock_boosters = ?, boosters_tick = ? WHERE id = ? AND stock_boosters = ? AND boosters_tick = ?",
    )
    .bind(etat.stock - 1, etat.tick, compte.id, ligne?.stock_boosters ?? 0, ligne?.boosters_tick ?? maintenant)
    .run();
  if (decrement.meta.changes !== 1) {
    // Une autre ouverture a modifié le stock entre-temps : on demande de réessayer (aucune carte n'a été ajoutée).
    return c.json({ erreur: "conflit_ouverture" }, 409);
  }

  // Le décrément est acquis : on tire les cartes et on les ajoute à la collection de façon atomique.
  const pools = construirePools(catalogue);
  const tirees = tirerBooster(pools, set, aleatoireCrypto());

  const requetes = tirees.map((t) =>
    base
      .prepare(
        `INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, ?, ?, 1)
         ON CONFLICT (compte_id, card_code, est_foil) DO UPDATE SET quantite = quantite + 1`,
      )
      .bind(compte.id, t.code, t.foil ? 1 : 0),
  );
  requetes.push(
    base
      .prepare("INSERT INTO ouvertures_boosters (compte_id, set_code, horodatage) VALUES (?, ?, ?)")
      .bind(compte.id, set, maintenant),
  );
  // Cartes remarquables (Epic et au-delà) : tracées pour le monitoring admin, dans le même lot atomique.
  const parCode = new Map(catalogue.cartes.map((carte) => [carte.code, carte]));
  for (const t of tirees) {
    const carte = parCode.get(t.code);
    if (carte && estRemarquable(carte)) {
      requetes.push(
        base
          .prepare("INSERT INTO tirages_remarquables (compte_id, card_code, est_foil, horodatage) VALUES (?, ?, ?, ?)")
          .bind(compte.id, t.code, t.foil ? 1 : 0, maintenant),
      );
    }
  }
  await base.batch(requetes);

  // Enrichissement pour l'affichage (données de carte issues du catalogue, jamais de la base).
  // La fiche de carte du site lit tous les champs (domaines, texte, énergie…) : on renvoie la carte complète,
  // exactement comme le catalogue et la collection, plus le foil et le slot du tirage.
  const cartes = tirees.flatMap((t) => {
    const carte = parCode.get(t.code);
    return carte ? [{ ...carte, foil: t.foil, slot: t.slot }] : [];
  });

  const nouvelEtat = { stock: etat.stock - 1, tick: etat.tick };
  return c.json({
    set,
    cartes,
    stock: { actuel: nouvelEtat.stock, max: STOCK_MAX, prochainDansMs: prochainDansMs(nouvelEtat, maintenant) },
  });
});
