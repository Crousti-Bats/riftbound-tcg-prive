/**
 * Routes /api/decks : les decks du joueur connecté, construits avec les cartes de SA collection (demandé le 2026-11-10).
 * La base ne garde que des cardCode et des quantités (JSON). Les règles du jeu et la possession sont vérifiées à
 * chaque lecture et enregistrement (regles-deck.ts) : un deck incomplet peut être enregistré, il est simplement
 * signalé « non valide ». L'export texte sert à jouer sur TCG Arena (ou Rift Atlas, riftbound.gg…).
 */
import { Hono } from "hono";
import { z } from "zod";
import { exigerConnexion } from "../authentification/sessions";
import { obtenirCatalogue } from "../catalogue/source-cartes";
import type { Catalogue, CarteCatalogue } from "../catalogue/types-catalogue";
import { lireCorps } from "../lecture-requete";
import { compterTentative, REGLES } from "../securite/limitation-tentatives";
import type { ContexteApi } from "../types-application";
import { type ContenuDeck, DECK_VIDE, exporterTexte, nomsDesChampions, validerDeck } from "./regles-deck";

export const routesDecks = new Hono<ContexteApi>();

routesDecks.use("*", exigerConnexion);

routesDecks.onError((err, c) => {
  console.error("decks indisponibles", err);
  return c.json({ erreur: "decks_indisponibles" }, 503);
});

export const MAX_DECKS = 20;

const schemaCode = z.string().regex(/^[a-z0-9-]{3,40}$/);
const schemaNom = z.string().trim().min(1).max(40);
const schemaLignes = (max: number, maxParCode: number) =>
  z.array(z.strictObject({ code: schemaCode, n: z.number().int().min(1).max(maxParCode) })).max(max);
export const schemaContenu = z.strictObject({
  legende: schemaCode.nullable(),
  champion: schemaCode.nullable(),
  principal: schemaLignes(80, 3),
  runes: schemaLignes(12, 12),
  terrains: z.array(schemaCode).max(3),
});
const schemaId = z.coerce.number().int().min(1).max(1e12);

/** Index du catalogue (par code, noms des champions), recalculé seulement quand le catalogue change. */
let index: { catalogue: Catalogue; parCode: Map<string, CarteCatalogue>; champions: Set<string> } | null = null;
function indexer(catalogue: Catalogue) {
  if (index?.catalogue !== catalogue) {
    index = { catalogue, parCode: new Map(catalogue.cartes.map((c) => [c.code, c])), champions: nomsDesChampions(catalogue.cartes) };
  }
  return index;
}

/** Quantité possédée par code (normale + foil). */
async function chargerPossession(base: D1Database, compteId: number): Promise<Map<string, number>> {
  const { results } = await base
    .prepare("SELECT card_code, SUM(quantite) AS n FROM collection WHERE compte_id = ? AND quantite > 0 GROUP BY card_code")
    .bind(compteId)
    .all<{ card_code: string; n: number }>();
  return new Map(results.map((r) => [r.card_code, Number(r.n)]));
}

/** Contenu stocké → contenu sûr (un JSON abîmé ou d'un ancien format donne un deck vide plutôt qu'une erreur). */
function lireContenu(brut: string): ContenuDeck {
  try {
    const r = schemaContenu.safeParse(JSON.parse(brut));
    return r.success ? r.data : DECK_VIDE;
  } catch {
    return DECK_VIDE;
  }
}

const codesDu = (deck: ContenuDeck) => [
  ...(deck.legende ? [deck.legende] : []),
  ...(deck.champion ? [deck.champion] : []),
  ...deck.principal.map((l) => l.code),
  ...deck.runes.map((l) => l.code),
  ...deck.terrains,
];

/** Tout ce qu'il faut à l'éditeur : contenu, cartes du deck, possession de ces cartes, validation et export. */
function analyser(deck: ContenuDeck, catalogue: Catalogue, possession: Map<string, number>) {
  const { parCode, champions } = indexer(catalogue);
  const cartes: Record<string, CarteCatalogue> = {};
  const possedees: Record<string, number> = {};
  for (const code of codesDu(deck)) {
    const carte = parCode.get(code);
    if (carte) cartes[code] = carte;
    possedees[code] = possession.get(code) ?? 0;
  }
  return {
    contenu: deck,
    cartes,
    possession: possedees,
    validation: validerDeck(deck, parCode, champions, possession),
    export: exporterTexte(deck, parCode, champions),
  };
}

interface LigneDeckBase {
  id: number;
  nom: string;
  contenu: string;
  modifie_le: number;
}

/** Mes decks, le plus récemment modifié d'abord, avec leur Légende et s'ils sont valides. */
routesDecks.get("/", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const base = c.env.BASE_DE_DONNEES;
  const [{ results }, possession, catalogue] = await Promise.all([
    base
      .prepare("SELECT id, nom, contenu, modifie_le FROM decks WHERE compte_id = ? ORDER BY modifie_le DESC")
      .bind(compte.id)
      .all<LigneDeckBase>(),
    chargerPossession(base, compte.id),
    obtenirCatalogue(),
  ]);
  const { parCode, champions } = indexer(catalogue);
  const decks = results.map((d) => {
    const contenu = lireContenu(d.contenu);
    const validation = validerDeck(contenu, parCode, champions, possession);
    return {
      id: d.id,
      nom: d.nom,
      modifieLe: d.modifie_le,
      legende: (contenu.legende && parCode.get(contenu.legende)) || null,
      valide: validation.valide,
      compteurs: validation.compteurs,
    };
  });
  return c.json({ decks, max: MAX_DECKS });
});

routesDecks.post("/", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const base = c.env.BASE_DE_DONNEES;
  const lecture = await lireCorps(c, z.strictObject({ nom: schemaNom }));
  if (!lecture.ok) return lecture.reponse;
  if (!(await compterTentative(base, `decks:compte:${compte.id}`, REGLES.decksParCompte)).autorisee) {
    return c.json({ erreur: "trop_de_modifications" }, 429);
  }
  const maintenant = Date.now();
  // Plafond vérifié dans la même requête que l'insertion (pas de dépassement avec des créations simultanées).
  const ajout = await base
    .prepare(
      `INSERT INTO decks (compte_id, nom, contenu, cree_le, modifie_le)
       SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM decks WHERE compte_id = ?) < ?
       RETURNING id`,
    )
    .bind(compte.id, lecture.donnees.nom, JSON.stringify(DECK_VIDE), maintenant, maintenant, compte.id, MAX_DECKS)
    .first<{ id: number }>();
  if (!ajout) return c.json({ erreur: "trop_de_decks" }, 409);
  return c.json({ id: ajout.id }, 201);
});

routesDecks.get("/:id", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const id = schemaId.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ erreur: "deck_introuvable" }, 404);
  const base = c.env.BASE_DE_DONNEES;
  const ligne = await base
    .prepare("SELECT id, nom, contenu, modifie_le FROM decks WHERE id = ? AND compte_id = ?")
    .bind(id.data, compte.id)
    .first<LigneDeckBase>();
  if (!ligne) return c.json({ erreur: "deck_introuvable" }, 404);
  const [possession, catalogue] = await Promise.all([chargerPossession(base, compte.id), obtenirCatalogue()]);
  return c.json({ id: ligne.id, nom: ligne.nom, modifieLe: ligne.modifie_le, ...analyser(lireContenu(ligne.contenu), catalogue, possession) });
});

/** Enregistre le deck entier (nom + contenu) et renvoie la nouvelle validation. */
routesDecks.post("/:id", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const id = schemaId.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ erreur: "deck_introuvable" }, 404);
  const base = c.env.BASE_DE_DONNEES;
  const lecture = await lireCorps(c, z.strictObject({ nom: schemaNom, contenu: schemaContenu }));
  if (!lecture.ok) return lecture.reponse;
  const { nom, contenu } = lecture.donnees;

  const catalogue = await obtenirCatalogue();
  const { parCode } = indexer(catalogue);
  if (codesDu(contenu).some((code) => !parCode.has(code))) return c.json({ erreur: "carte_introuvable" }, 400);

  if (!(await compterTentative(base, `decks:compte:${compte.id}`, REGLES.decksParCompte)).autorisee) {
    return c.json({ erreur: "trop_de_modifications" }, 429);
  }
  const maintenant = Date.now();
  const maj = await base
    .prepare("UPDATE decks SET nom = ?, contenu = ?, modifie_le = ? WHERE id = ? AND compte_id = ?")
    .bind(nom, JSON.stringify(contenu), maintenant, id.data, compte.id)
    .run();
  if (!maj.meta.changes) return c.json({ erreur: "deck_introuvable" }, 404);
  const possession = await chargerPossession(base, compte.id);
  return c.json({ id: id.data, nom, modifieLe: maintenant, ...analyser(contenu, catalogue, possession) });
});

routesDecks.delete("/:id", async (c) => {
  const compte = c.get("compte");
  if (!compte) return c.json({ erreur: "non_connecte" }, 401);
  const id = schemaId.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ erreur: "deck_introuvable" }, 404);
  const suppression = await c.env.BASE_DE_DONNEES.prepare("DELETE FROM decks WHERE id = ? AND compte_id = ?")
    .bind(id.data, compte.id)
    .run();
  if (!suppression.meta.changes) return c.json({ erreur: "deck_introuvable" }, 404);
  return c.json({ ok: true });
});
