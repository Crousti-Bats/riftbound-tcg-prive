/** Routes /api/catalogue : sets et cartes. Réservées aux joueurs connectés (site privé). */
import { Hono } from "hono";
import { z } from "zod";
import { exigerConnexion } from "../authentification/sessions";
import type { ContexteApi } from "../types-application";
import { obtenirCatalogue } from "./source-cartes";
import { RARETES, VARIANTES } from "./types-catalogue";

export const routesCatalogue = new Hono<ContexteApi>();

routesCatalogue.use("*", exigerConnexion);

// Si la source des cartes est injoignable (et rien en cache), on le dit clairement au lieu d'une erreur 500.
routesCatalogue.onError((err, c) => {
  console.error("catalogue indisponible", err);
  return c.json({ erreur: "catalogue_indisponible" }, 503);
});

const CARTES_PAR_PAGE = 60;

const schemaRecherche = z.object({
  set: z.string().regex(/^[a-z]{2,5}$/).optional(),
  rarete: z.enum(RARETES).optional(),
  variante: z.enum(VARIANTES).optional(),
  recherche: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

routesCatalogue.get("/sets", async (c) => {
  const catalogue = await obtenirCatalogue();
  return c.json({ sets: catalogue.sets, miseAJourSource: catalogue.miseAJourSource, nbCartes: catalogue.cartes.length });
});

routesCatalogue.get("/cartes", async (c) => {
  const filtres = schemaRecherche.safeParse(c.req.query());
  if (!filtres.success) return c.json({ erreur: "donnees_invalides" }, 400);
  const { set, rarete, variante, recherche, page } = filtres.data;

  const catalogue = await obtenirCatalogue();
  const mots = recherche ? sansAccents(recherche).split(/\s+/).filter(Boolean) : [];
  const resultat = catalogue.cartes.filter((carte) => {
    if (set && carte.set !== set) return false;
    if (rarete && carte.rarete !== rarete) return false;
    if (variante && carte.variante !== variante) return false;
    if (mots.length) {
      const texte = sansAccents(`${carte.nom} ${carte.sousTitre ?? ""} ${carte.type} ${carte.domaines.join(" ")} ${carte.numero}`);
      if (!mots.every((m) => texte.includes(m))) return false;
    }
    return true;
  });

  const debut = (page - 1) * CARTES_PAR_PAGE;
  return c.json({
    cartes: resultat.slice(debut, debut + CARTES_PAR_PAGE),
    total: resultat.length,
    page,
    parPage: CARTES_PAR_PAGE,
  });
});

routesCatalogue.get("/cartes/:code", async (c) => {
  const code = c.req.param("code");
  if (!/^[a-z0-9-]{3,40}$/.test(code)) return c.json({ erreur: "introuvable" }, 404);
  const carte = (await obtenirCatalogue()).cartes.find((x) => x.code === code);
  if (!carte) return c.json({ erreur: "introuvable" }, 404);
  return c.json({ carte });
});
