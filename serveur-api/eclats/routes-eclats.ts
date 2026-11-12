/**
 * Routes /api/eclats : recycler ses doublons en éclats, puis acheter un booster ou fabriquer une carte.
 * Réservées aux joueurs connectés. Tous les calculs (doublons, valeurs, prix) sont faits côté serveur.
 *
 * Intégrité : chaque opération est UN SEUL lot D1 (transaction).
 * - Recyclage : on retire les cartes, puis on crédite les éclats SEULEMENT si la collection de chaque carte recyclée
 *   vaut exactement ce qui était prévu ; sinon (échange, booster ou autre recyclage entre-temps, ligne absente) le
 *   crédit force `eclats = -1`, la contrainte CHECK (eclats >= 0) fait échouer le lot et TOUT est annulé.
 * - Achat et fabrication : le débit viole CHECK (eclats >= 0) si le solde ne suffit pas, et rien n'est écrit.
 */
import { type Context, Hono } from "hono";
import { z } from "zod";
import { exigerConnexion } from "../authentification/sessions";
import { obtenirCatalogue } from "../catalogue/source-cartes";
import type { CarteCatalogue } from "../catalogue/types-catalogue";
import { lireContenu } from "../decks/routes-decks";
import { utilisationDuDeck } from "../decks/regles-deck";
import { estErreurStockInsuffisant } from "../echanges/regles-echanges";
import { lireCorps } from "../lecture-requete";
import { compterTentative, REGLES } from "../securite/limitation-tentatives";
import type { ContexteApi } from "../types-application";
import {
  coutFabrication,
  doublonsDe,
  exemplairesProteges,
  type Possede,
  PRIX_BOOSTER,
  usageMaximal,
  valeurRecyclage,
} from "./regles-eclats";

export const routesEclats = new Hono<ContexteApi>();

routesEclats.use("*", exigerConnexion);

const schemaCode = z.string().regex(/^[a-z0-9-]{3,40}$/);

function idCompte(c: Context<ContexteApi>): number {
  const compte = c.get("compte");
  if (!compte) throw new Error("compte absent après exigerConnexion");
  return compte.id;
}

/** Solde, possession (normale / foil) et usage maximal de chaque carte dans mes decks, lus ensemble. */
async function chargerEtat(base: D1Database, compteId: number) {
  const [solde, collection, decks] = await base.batch([
    base.prepare("SELECT eclats FROM comptes WHERE id = ?").bind(compteId),
    base.prepare("SELECT card_code, est_foil, quantite FROM collection WHERE compte_id = ? AND quantite > 0").bind(compteId),
    base.prepare("SELECT contenu FROM decks WHERE compte_id = ?").bind(compteId),
  ]);
  const possession = new Map<string, Possede>();
  for (const l of collection?.results as Array<{ card_code: string; est_foil: number; quantite: number }>) {
    const p = possession.get(l.card_code) ?? { normale: 0, foil: 0 };
    if (l.est_foil) p.foil += l.quantite;
    else p.normale += l.quantite;
    possession.set(l.card_code, p);
  }
  const usage = usageMaximal((decks?.results as Array<{ contenu: string }>).map((d) => utilisationDuDeck(lireContenu(d.contenu))));
  return { solde: (solde?.results[0] as { eclats: number } | undefined)?.eclats ?? 0, possession, usage };
}

interface LigneRecyclage {
  c: string;
  f: 0 | 1;
  n: number;
}

/** Les doublons recyclables de toute ma collection (cartes inconnues du catalogue ou sans valeur : ignorées). */
function tousLesDoublons(
  possession: ReadonlyMap<string, Possede>,
  usage: ReadonlyMap<string, number>,
  parCode: ReadonlyMap<string, CarteCatalogue>,
): LigneRecyclage[] {
  const lignes: LigneRecyclage[] = [];
  for (const [code, possede] of possession) {
    const carte = parCode.get(code);
    if (!carte || valeurRecyclage(carte, false) === 0) continue;
    const d = doublonsDe(possede, exemplairesProteges(usage.get(code)));
    if (d.normale > 0) lignes.push({ c: code, f: 0, n: d.normale });
    if (d.foil > 0) lignes.push({ c: code, f: 1, n: d.foil });
  }
  return lignes;
}

const gainDe = (lignes: LigneRecyclage[], parCode: ReadonlyMap<string, CarteCatalogue>) =>
  lignes.reduce((total, l) => {
    const carte = parCode.get(l.c);
    return total + (carte ? valeurRecyclage(carte, l.f === 1) * l.n : 0);
  }, 0);

/** Mon solde et la liste de mes doublons recyclables (pour « Recycler mes doublons »), les plus précieux d'abord. */
routesEclats.get("/", async (c) => {
  const moi = idCompte(c);
  const [{ solde, possession, usage }, catalogue] = await Promise.all([chargerEtat(c.env.BASE_DE_DONNEES, moi), obtenirCatalogue()]);
  const parCode = new Map(catalogue.cartes.map((carte) => [carte.code, carte]));
  const parCarte = new Map<string, { normale: number; foil: number }>();
  for (const l of tousLesDoublons(possession, usage, parCode)) {
    const d = parCarte.get(l.c) ?? { normale: 0, foil: 0 };
    if (l.f) d.foil = l.n;
    else d.normale = l.n;
    parCarte.set(l.c, d);
  }
  const cartes = [...parCarte].flatMap(([code, d]) => {
    const carte = parCode.get(code);
    if (!carte) return [];
    const eclats = valeurRecyclage(carte, false) * d.normale + valeurRecyclage(carte, true) * d.foil;
    return [{ ...carte, doublons: d, eclats }];
  });
  cartes.sort((a, b) => b.eclats - a.eclats);
  return c.json({
    solde,
    prixBooster: PRIX_BOOSTER,
    doublons: {
      exemplaires: cartes.reduce((n, x) => n + x.doublons.normale + x.doublons.foil, 0),
      eclats: cartes.reduce((n, x) => n + x.eclats, 0),
      cartes,
    },
  });
});

/** Tout ce qu'il faut à la fiche d'une carte : possession, exemplaires protégés, valeurs, coût de fabrication. */
routesEclats.get("/carte/:code", async (c) => {
  const moi = idCompte(c);
  const code = schemaCode.safeParse(c.req.param("code"));
  if (!code.success) return c.json({ erreur: "donnees_invalides" }, 400);
  const [{ solde, possession, usage }, catalogue] = await Promise.all([chargerEtat(c.env.BASE_DE_DONNEES, moi), obtenirCatalogue()]);
  const carte = catalogue.cartes.find((x) => x.code === code.data);
  if (!carte) return c.json({ erreur: "carte_inconnue" }, 404);
  const possede = possession.get(carte.code) ?? { normale: 0, foil: 0 };
  const proteges = exemplairesProteges(usage.get(carte.code));
  return c.json({
    solde,
    possede,
    proteges,
    utiliseeDansUnDeck: usage.get(carte.code) ?? 0,
    recyclables: Math.max(0, possede.normale + possede.foil - proteges),
    valeur: { normale: valeurRecyclage(carte, false), foil: valeurRecyclage(carte, true) },
    coutFabrication: coutFabrication(carte),
  });
});

/** Absent : tous mes doublons. Présent : `n` exemplaires d'une carte, en normale ou en foil. */
const schemaRecyclage = z.strictObject({
  code: schemaCode.optional(),
  foil: z.boolean().optional(),
  n: z.number().int().min(1).max(999).optional(),
});

routesEclats.post("/recycler", async (c) => {
  const moi = idCompte(c);
  const base = c.env.BASE_DE_DONNEES;
  const lecture = await lireCorps(c, schemaRecyclage);
  if (!lecture.ok) return lecture.reponse;
  const demande = lecture.donnees;
  if (!(await compterTentative(base, `eclats:compte:${moi}`, REGLES.eclatsParCompte)).autorisee) {
    return c.json({ erreur: "trop_de_requetes" }, 429);
  }

  const [{ possession, usage }, catalogue] = await Promise.all([chargerEtat(base, moi), obtenirCatalogue()]);
  const parCode = new Map(catalogue.cartes.map((carte) => [carte.code, carte]));

  let lignes: LigneRecyclage[];
  if (demande.code) {
    const carte = parCode.get(demande.code);
    if (!carte || valeurRecyclage(carte, false) === 0) return c.json({ erreur: "non_recyclable" }, 400);
    const possede = possession.get(demande.code) ?? { normale: 0, foil: 0 };
    const n = demande.n ?? 1;
    const disponibles = demande.foil ? possede.foil : possede.normale;
    const recyclables = possede.normale + possede.foil - exemplairesProteges(usage.get(demande.code));
    if (n > disponibles || n > recyclables) return c.json({ erreur: "pas_assez_de_doublons" }, 409);
    lignes = [{ c: demande.code, f: demande.foil ? 1 : 0, n }];
  } else {
    lignes = tousLesDoublons(possession, usage, parCode);
  }
  if (lignes.length === 0) return c.json({ erreur: "aucun_doublon" }, 409);

  const gain = gainDe(lignes, parCode);
  // Total attendu (normale + foil) de chaque carte recyclée, une fois le lot appliqué.
  const attendus = new Map<string, number>();
  for (const l of lignes) {
    const p = possession.get(l.c) ?? { normale: 0, foil: 0 };
    attendus.set(l.c, (attendus.get(l.c) ?? p.normale + p.foil) - l.n);
  }
  const totaux = JSON.stringify([...attendus].map(([code, t]) => ({ c: code, t })));

  try {
    await base.batch([
      base
        .prepare(
          `UPDATE collection SET quantite = quantite - (
             SELECT json_extract(j.value, '$.n') FROM json_each(?1) j
             WHERE json_extract(j.value, '$.c') = collection.card_code AND json_extract(j.value, '$.f') = collection.est_foil)
           WHERE compte_id = ?2 AND EXISTS (
             SELECT 1 FROM json_each(?1) j
             WHERE json_extract(j.value, '$.c') = collection.card_code AND json_extract(j.value, '$.f') = collection.est_foil)`,
        )
        .bind(JSON.stringify(lignes), moi),
      base
        .prepare(
          `UPDATE comptes SET eclats = CASE WHEN EXISTS (
             SELECT 1 FROM json_each(?1) j
             WHERE (SELECT COALESCE(SUM(x.quantite), 0) FROM collection x
                    WHERE x.compte_id = ?2 AND x.card_code = json_extract(j.value, '$.c')) <> json_extract(j.value, '$.t')
           ) THEN -1 ELSE eclats + ?3 END
           WHERE id = ?2`,
        )
        .bind(totaux, moi, gain),
    ]);
  } catch (err) {
    if (estErreurStockInsuffisant(err)) return c.json({ erreur: "collection_modifiee" }, 409);
    throw err;
  }

  const solde = await base.prepare("SELECT eclats FROM comptes WHERE id = ?").bind(moi).first<{ eclats: number }>();
  return c.json({ gain, exemplaires: lignes.reduce((n, l) => n + l.n, 0), solde: solde?.eclats ?? 0 });
});

routesEclats.post("/acheter-booster", async (c) => {
  const moi = idCompte(c);
  const base = c.env.BASE_DE_DONNEES;
  const lecture = await lireCorps(c, z.strictObject({}));
  if (!lecture.ok) return lecture.reponse;
  if (!(await compterTentative(base, `eclats:compte:${moi}`, REGLES.eclatsParCompte)).autorisee) {
    return c.json({ erreur: "trop_de_requetes" }, 429);
  }
  try {
    const ligne = await base
      .prepare("UPDATE comptes SET eclats = eclats - ?, boosters_bonus = boosters_bonus + 1 WHERE id = ? RETURNING eclats, boosters_bonus")
      .bind(PRIX_BOOSTER, moi)
      .first<{ eclats: number; boosters_bonus: number }>();
    return c.json({ solde: ligne?.eclats ?? 0, offerts: ligne?.boosters_bonus ?? 0 });
  } catch (err) {
    if (estErreurStockInsuffisant(err)) return c.json({ erreur: "eclats_insuffisants" }, 409);
    throw err;
  }
});

routesEclats.post("/fabriquer", async (c) => {
  const moi = idCompte(c);
  const base = c.env.BASE_DE_DONNEES;
  const lecture = await lireCorps(c, z.strictObject({ code: schemaCode }));
  if (!lecture.ok) return lecture.reponse;
  const { code } = lecture.donnees;
  const catalogue = await obtenirCatalogue();
  const carte = catalogue.cartes.find((x) => x.code === code);
  const cout = carte ? coutFabrication(carte) : null;
  if (!carte || cout === null) return c.json({ erreur: "non_fabricable" }, 400);
  if (!(await compterTentative(base, `eclats:compte:${moi}`, REGLES.eclatsParCompte)).autorisee) {
    return c.json({ erreur: "trop_de_requetes" }, 429);
  }
  try {
    await base.batch([
      base.prepare("UPDATE comptes SET eclats = eclats - ? WHERE id = ?").bind(cout, moi),
      base
        .prepare(
          `INSERT INTO collection (compte_id, card_code, est_foil, quantite) VALUES (?, ?, 0, 1)
           ON CONFLICT (compte_id, card_code, est_foil) DO UPDATE SET quantite = quantite + 1`,
        )
        .bind(moi, code),
      // Une carte obtenue quitte ma wishlist (comme après un booster ou un échange).
      base.prepare("DELETE FROM wishlist WHERE compte_id = ? AND card_code = ?").bind(moi, code),
    ]);
  } catch (err) {
    if (estErreurStockInsuffisant(err)) return c.json({ erreur: "eclats_insuffisants" }, 409);
    throw err;
  }
  const solde = await base.prepare("SELECT eclats FROM comptes WHERE id = ?").bind(moi).first<{ eclats: number }>();
  return c.json({ code, cout, solde: solde?.eclats ?? 0 });
});
