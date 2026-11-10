/** Routes /api/collection : cartes possédées par le joueur connecté, et résumé de complétion.
 *  La base ne stocke que des cardCode et des quantités : les données de carte viennent du catalogue. */
import { type Context, Hono } from "hono";
import { z } from "zod";
import { schemaPseudo } from "../validation-donnees";
import { exigerConnexion } from "../authentification/sessions";
import { correspondAuType } from "../catalogue/classification-cartes";
import { sansAccents } from "../catalogue/recherche-texte";
import { obtenirCatalogue } from "../catalogue/source-cartes";
import { RARETES, VARIANTES } from "../catalogue/types-catalogue";
import type { ContexteApi } from "../types-application";

export const routesCollection = new Hono<ContexteApi>();

routesCollection.use("*", exigerConnexion);

routesCollection.onError((err, c) => {
  console.error("collection indisponible", err);
  return c.json({ erreur: "collection_indisponible" }, 503);
});

const CARTES_PAR_PAGE = 60;

const schemaRecherche = z.object({
  set: z.string().regex(/^[a-z]{2,5}$/).optional(),
  rarete: z.enum(RARETES).optional(),
  variante: z.enum(VARIANTES).optional(),
  type: z.string().regex(/^[A-Za-z]{2,20}$/).optional(),
  recherche: z.string().trim().max(50).optional(),
  /** Une carte précise (pré-remplissage d'un échange depuis une annonce du marché). */
  code: z.string().regex(/^[a-z0-9-]{3,40}$/).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

interface LigneCollection {
  card_code: string;
  est_foil: number;
  quantite: number;
}

/** Possession par code : quantité normale et quantité foil. */
async function chargerPossession(base: D1Database, compteId: number): Promise<Map<string, { normale: number; foil: number }>> {
  const { results } = await base
    .prepare("SELECT card_code, est_foil, quantite FROM collection WHERE compte_id = ? AND quantite > 0")
    .bind(compteId)
    .all<LigneCollection>();
  const parCode = new Map<string, { normale: number; foil: number }>();
  for (const ligne of results) {
    const entree = parCode.get(ligne.card_code) ?? { normale: 0, foil: 0 };
    if (ligne.est_foil) entree.foil += ligne.quantite;
    else entree.normale += ligne.quantite;
    parCode.set(ligne.card_code, entree);
  }
  return parCode;
}

routesCollection.get("/", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  return listerCartesPossedees(c, compte.id);
});

/** Collection d'un autre joueur (pour préparer un échange : décision « toute la collection est visible »). */
routesCollection.get("/joueur/:pseudo", async (c) => {
  const pseudo = schemaPseudo.safeParse(c.req.param("pseudo"));
  if (!pseudo.success) return c.json({ erreur: "joueur_introuvable" }, 404);
  const joueur = await c.env.BASE_DE_DONNEES.prepare("SELECT id FROM comptes WHERE pseudo = ? AND actif = 1")
    .bind(pseudo.data)
    .first<{ id: number }>();
  if (!joueur) return c.json({ erreur: "joueur_introuvable" }, 404);
  return listerCartesPossedees(c, joueur.id);
});

async function listerCartesPossedees(c: Context<ContexteApi>, compteId: number) {
  const filtres = schemaRecherche.safeParse(c.req.query());
  if (!filtres.success) return c.json({ erreur: "donnees_invalides" }, 400);
  const { set, rarete, variante, type, recherche, code, page } = filtres.data;
  const seulementFoil = c.req.query("foil") === "1";
  const seulementDoublons = c.req.query("doublons") === "1";

  const possession = await chargerPossession(c.env.BASE_DE_DONNEES, compteId);
  const catalogue = await obtenirCatalogue();
  const mots = recherche ? sansAccents(recherche).split(/\s+/).filter(Boolean) : [];

  // On parcourt le catalogue (déjà trié) pour garder le même ordre d'affichage.
  const cartes = [];
  for (const carte of catalogue.cartes) {
    const possede = possession.get(carte.code);
    if (!possede) continue;
    if (code && carte.code !== code) continue;
    if (set && carte.set !== set) continue;
    if (rarete && carte.rarete !== rarete) continue;
    if (variante && carte.variante !== variante) continue;
    if (type && !correspondAuType(carte, type)) continue;
    if (seulementFoil && possede.foil === 0) continue;
    if (seulementDoublons && possede.normale + possede.foil < 2) continue;
    if (mots.length) {
      const texte = sansAccents(`${carte.nom} ${carte.sousTitre ?? ""} ${carte.type} ${carte.domaines.join(" ")} ${carte.numero}`);
      if (!mots.every((m) => texte.includes(m))) continue;
    }
    cartes.push({ ...carte, quantite: possede.normale, quantiteFoil: possede.foil });
  }

  const debut = (page - 1) * CARTES_PAR_PAGE;
  return c.json({ cartes: cartes.slice(debut, debut + CARTES_PAR_PAGE), total: cartes.length, page, parPage: CARTES_PAR_PAGE });
}

routesCollection.get("/resume", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);

  const possession = await chargerPossession(c.env.BASE_DE_DONNEES, compte.id);
  const catalogue = await obtenirCatalogue();
  const parCode = new Map(catalogue.cartes.map((carte) => [carte.code, carte]));

  let totalCartes = 0;
  const baseParSet = new Map<string, number>(); // cartes de base distinctes possédées, par set
  for (const [code, qte] of possession) {
    totalCartes += qte.normale + qte.foil;
    const carte = parCode.get(code);
    if (carte && carte.variante === "base") baseParSet.set(carte.set, (baseParSet.get(carte.set) ?? 0) + 1);
  }

  const parSet = catalogue.sets.map((s) => ({
    code: s.code,
    nom: s.nom,
    possedees: baseParSet.get(s.code) ?? 0,
    total: s.parVariante.base ?? 0,
  }));

  return c.json({ totalCartes, cartesDistinctes: possession.size, parSet });
});
