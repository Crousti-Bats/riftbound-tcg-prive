/**
 * Routes /api/minijeux (demandé le 2026-11-13) : « Devine le champion » (3 modes par jour) et Memory.
 * Réservées aux joueurs connectés. Tout ce qui compte est décidé par le serveur :
 * - le défi du jour est tiré avec crypto.getRandomValues, puis figé en base (le dépôt est public : une graine calculable
 *   à partir de la date donnerait la réponse) ;
 * - l'illustration du jour passe par le serveur, pour que son adresse ne trahisse pas la carte ;
 * - la grille du Memory reste sur le serveur, une carte n'est envoyée que quand on la retourne ;
 * - les gains en éclats sont crédités dans le même lot D1 que le coup gagnant, une seule fois (gain_credite).
 */
import { type Context, Hono } from "hono";
import { z } from "zod";
import { exigerConnexion } from "../authentification/sessions";
import { aleatoireCrypto, type Aleatoire } from "../boosters/aleatoire";
import { PREFIXE_IMAGES } from "../catalogue/classification-cartes";
import { obtenirCatalogue } from "../catalogue/source-cartes";
import type { CarteCatalogue, Catalogue } from "../catalogue/types-catalogue";
import { lireCorps } from "../lecture-requete";
import { compterTentative, REGLES } from "../securite/limitation-tentatives";
import type { ContexteApi } from "../types-application";
import {
  centreDuZoom,
  type Champion,
  championDeLaCarte,
  comparer,
  gainDevinette,
  gainMemory,
  jourDeParis,
  jourPrecedent,
  listerChampions,
  type Mode,
  MODES,
  PAIRES_MEMORY,
  PLAFOND_MEMORY_JOUR,
  texteMasque,
  zoomIllustration,
} from "./regles-minijeux";

export const routesMiniJeux = new Hono<ContexteApi>();

routesMiniJeux.use("*", exigerConnexion);

const schemaMode = z.enum(MODES);
const schemaCode = z.string().regex(/^[a-z0-9-]{3,40}$/);

function idCompte(c: Context<ContexteApi>): number {
  const compte = c.get("compte");
  if (!compte) throw new Error("compte absent après exigerConnexion");
  return compte.id;
}

const tirer = <T>(liste: readonly T[], alea: Aleatoire): T | undefined => liste[Math.floor(alea() * liste.length)];

const vignette = (ch: Champion) => ({ id: ch.id, nom: ch.nom, image: ch.image });

// ---------- Défi du jour ----------

interface Defi {
  /** Carte réponse : Légende (classique, capacité) ou carte illustrée (illustration). */
  carte: CarteCatalogue;
  champion: Champion;
}

/** Choisit la carte réponse d'un mode pour un champion tiré au hasard (jamais celui de la veille). */
function choisirReponse(champions: readonly Champion[], mode: Mode, exclu: string | null, alea: Aleatoire): CarteCatalogue | null {
  const candidats = champions.filter((ch) => {
    if (ch.nom === exclu) return false;
    if (mode === "capacite") return ch.legendes.some((l) => (l.texte ?? "").trim().length > 0);
    if (mode === "illustration") return ch.illustrations.length > 0;
    return true;
  });
  const champion = tirer(candidats, alea);
  if (!champion) return null;
  if (mode === "capacite") return tirer(champion.legendes.filter((l) => (l.texte ?? "").trim().length > 0), alea) ?? null;
  if (mode === "illustration") return tirer(champion.illustrations, alea) ?? null;
  return champion.legendes[0] ?? null;
}

/** Le défi d'un jour : lu en base, ou tiré puis enregistré à la première visite (INSERT OR IGNORE : un seul gagnant). */
async function defiDuJour(base: D1Database, catalogue: Catalogue, jour: string, mode: Mode): Promise<Defi | null> {
  const champions = listerChampions(catalogue);
  const parCode = new Map(catalogue.cartes.map((c) => [c.code, c]));
  const lire = () => base.prepare("SELECT reponse FROM defis_du_jour WHERE jour = ? AND mode = ?").bind(jour, mode).first<{ reponse: string }>();
  let ligne = await lire();
  if (!ligne) {
    const hier = await base
      .prepare("SELECT reponse FROM defis_du_jour WHERE jour = ? AND mode = ?")
      .bind(jourPrecedent(jour), mode)
      .first<{ reponse: string }>();
    const exclu = hier ? (championDeLaCarte(champions, hier.reponse)?.nom ?? null) : null;
    const carte = choisirReponse(champions, mode, exclu, aleatoireCrypto());
    if (!carte) return null;
    await base.prepare("INSERT OR IGNORE INTO defis_du_jour (jour, mode, reponse) VALUES (?, ?, ?)").bind(jour, mode, carte.code).run();
    ligne = await lire();
  }
  const carte = ligne ? parCode.get(ligne.reponse) : undefined;
  const champion = carte ? championDeLaCarte(champions, carte.code) : null;
  return carte && champion ? { carte, champion } : null;
}

interface LigneDevinette {
  essais: string;
  nb_essais: number;
  trouve: number;
  gain: number;
}

const lireEssais = (texte: string | undefined): string[] => {
  try {
    const v: unknown = JSON.parse(texte ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/** Tout l'état d'un mode pour aujourd'hui, tel que l'affiche la page (jamais la réponse avant qu'elle soit trouvée). */
async function etatDevinette(base: D1Database, catalogue: Catalogue, compteId: number, mode: Mode, jour: string) {
  const defi = await defiDuJour(base, catalogue, jour, mode);
  if (!defi) return null;
  const champions = listerChampions(catalogue);
  const parId = new Map(champions.map((ch) => [ch.id, ch]));
  const [ligne, trouves, hier] = await base.batch([
    base.prepare("SELECT essais, nb_essais, trouve, gain FROM devinettes WHERE compte_id = ? AND jour = ? AND mode = ?").bind(compteId, jour, mode),
    base.prepare("SELECT COUNT(*) AS n FROM devinettes WHERE jour = ? AND mode = ? AND trouve = 1").bind(jour, mode),
    base.prepare("SELECT reponse FROM defis_du_jour WHERE jour = ? AND mode = ?").bind(jourPrecedent(jour), mode),
  ]);
  const moi = ligne?.results[0] as LigneDevinette | undefined;
  const trouve = moi?.trouve === 1;
  const essais = lireEssais(moi?.essais).flatMap((id) => {
    const ch = parId.get(id);
    if (!ch) return [];
    const juste = ch.nom === defi.champion.nom;
    return [{ champion: vignette(ch), juste, ...(mode === "classique" ? { comparaison: comparer(ch, defi.champion) } : {}) }];
  });
  const erreurs = essais.filter((e) => !e.juste).length;
  const reponseHier = (hier?.results[0] as { reponse: string } | undefined)?.reponse;
  const championHier = reponseHier ? championDeLaCarte(champions, reponseHier) : null;
  return {
    jour,
    mode,
    essais,
    trouve,
    gain: moi?.gain ?? 0,
    /** Ce que rapporterait une bonne réponse au prochain essai. */
    gainPossible: trouve ? 0 : gainDevinette(mode, essais.length + 1),
    trouvesAujourdhui: (trouves?.results[0] as { n: number } | undefined)?.n ?? 0,
    hier: championHier ? vignette(championHier) : null,
    indice:
      mode === "capacite"
        ? { texte: texteMasque(defi.carte, defi.champion) }
        : mode === "illustration"
          ? { centre: centreDuZoom(jour, defi.carte.code), zoom: zoomIllustration(erreurs, trouve) }
          : null,
    reponse: trouve
      ? { ...vignette(defi.champion), carte: { code: defi.carte.code, nom: defi.carte.nom, image: defi.carte.image } }
      : null,
  };
}

/** Résumé pour la page des mini-jeux : où j'en suis aujourd'hui. */
routesMiniJeux.get("/", async (c) => {
  const moi = idCompte(c);
  const base = c.env.BASE_DE_DONNEES;
  const jour = jourDeParis(Date.now());
  const [devinettes, memory] = await base.batch([
    base.prepare("SELECT mode, nb_essais, trouve, gain FROM devinettes WHERE compte_id = ? AND jour = ?").bind(moi, jour),
    base
      .prepare("SELECT COALESCE(SUM(gain), 0) AS gains, COUNT(*) AS parties FROM parties_memory WHERE compte_id = ? AND jour = ? AND terminee = 1")
      .bind(moi, jour),
  ]);
  const lignes = devinettes?.results as Array<{ mode: Mode; nb_essais: number; trouve: number; gain: number }>;
  const m = memory?.results[0] as { gains: number; parties: number } | undefined;
  return c.json({
    jour,
    devinette: Object.fromEntries(
      MODES.map((mode) => {
        const l = lignes.find((x) => x.mode === mode);
        return [mode, { essais: l?.nb_essais ?? 0, trouve: l?.trouve === 1, gain: l?.gain ?? 0, gainMax: gainDevinette(mode, 1) }];
      }),
    ),
    memory: { gainsDuJour: m?.gains ?? 0, plafond: PLAFOND_MEMORY_JOUR, parties: m?.parties ?? 0 },
  });
});

/** La liste des champions qu'on peut proposer (pour la recherche). */
routesMiniJeux.get("/champions", async (c) => {
  const catalogue = await obtenirCatalogue();
  return c.json({ champions: listerChampions(catalogue).map(vignette) });
});

routesMiniJeux.get("/devinette/illustration/image", async (c) => {
  const catalogue = await obtenirCatalogue();
  const defi = await defiDuJour(c.env.BASE_DE_DONNEES, catalogue, jourDeParis(Date.now()), "illustration");
  if (!defi || !defi.carte.image.startsWith(PREFIXE_IMAGES)) return c.json({ erreur: "defi_indisponible" }, 503);
  // Adresse fixe du CDN officiel, venue du catalogue (jamais du client) : pas de SSRF possible.
  const image = await fetch(`${defi.carte.image}?w=744&fm=webp`).catch(() => null);
  const type = image?.headers.get("Content-Type") ?? "";
  if (!image?.ok || !type.startsWith("image/")) return c.json({ erreur: "image_indisponible" }, 502);
  return new Response(image.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" } });
});

routesMiniJeux.get("/devinette/:mode", async (c) => {
  const mode = schemaMode.safeParse(c.req.param("mode"));
  if (!mode.success) return c.json({ erreur: "donnees_invalides" }, 400);
  const catalogue = await obtenirCatalogue();
  const etat = await etatDevinette(c.env.BASE_DE_DONNEES, catalogue, idCompte(c), mode.data, jourDeParis(Date.now()));
  if (!etat) return c.json({ erreur: "defi_indisponible" }, 503);
  return c.json(etat);
});

routesMiniJeux.post("/devinette/:mode/essai", async (c) => {
  const moi = idCompte(c);
  const base = c.env.BASE_DE_DONNEES;
  const mode = schemaMode.safeParse(c.req.param("mode"));
  if (!mode.success) return c.json({ erreur: "donnees_invalides" }, 400);
  const corps = await lireCorps(c, z.object({ champion: schemaCode }).strict());
  if (!corps.ok) return corps.reponse;

  const catalogue = await obtenirCatalogue();
  const jour = jourDeParis(Date.now());
  const defi = await defiDuJour(base, catalogue, jour, mode.data);
  if (!defi) return c.json({ erreur: "defi_indisponible" }, 503);
  const propose = listerChampions(catalogue).find((ch) => ch.id === corps.donnees.champion);
  if (!propose) return c.json({ erreur: "champion_inconnu" }, 400);

  const ligne = await base
    .prepare("SELECT essais, nb_essais, trouve, gain FROM devinettes WHERE compte_id = ? AND jour = ? AND mode = ?")
    .bind(moi, jour, mode.data)
    .first<LigneDevinette>();
  if (ligne?.trouve) return c.json({ erreur: "deja_trouve" }, 409);
  const essais = lireEssais(ligne?.essais);
  if (essais.includes(propose.id)) return c.json({ erreur: "deja_propose" }, 409);

  const nb = (ligne?.nb_essais ?? 0) + 1;
  const juste = propose.nom === defi.champion.nom;
  const gain = juste ? gainDevinette(mode.data, nb) : 0;
  const cle = [moi, jour, mode.data] as const;
  // Un seul lot : l'essai n'est enregistré que si personne n'a joué entre-temps (nb_essais inchangé),
  // et le gain n'est crédité qu'une fois (gain_credite).
  const [ecrit] = await base.batch([
    base
      .prepare(
        `INSERT INTO devinettes (compte_id, jour, mode, essais, nb_essais, trouve, gain) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (compte_id, jour, mode) DO UPDATE SET
           essais = excluded.essais, nb_essais = excluded.nb_essais, trouve = excluded.trouve, gain = excluded.gain
         WHERE devinettes.nb_essais = ? AND devinettes.trouve = 0
         RETURNING nb_essais`,
      )
      .bind(...cle, JSON.stringify([...essais, propose.id]), nb, juste ? 1 : 0, gain, nb - 1),
    base
      .prepare(
        `UPDATE comptes SET eclats = eclats + (
           SELECT gain FROM devinettes WHERE compte_id = ?1 AND jour = ?2 AND mode = ?3 AND trouve = 1 AND gain_credite = 0)
         WHERE id = ?1 AND EXISTS (
           SELECT 1 FROM devinettes WHERE compte_id = ?1 AND jour = ?2 AND mode = ?3 AND trouve = 1 AND gain_credite = 0)`,
      )
      .bind(...cle),
    base.prepare("UPDATE devinettes SET gain_credite = 1 WHERE compte_id = ? AND jour = ? AND mode = ? AND trouve = 1").bind(...cle),
  ]);
  if (!ecrit?.results.length) return c.json({ erreur: "conflit_partie" }, 409);

  const [etat, solde] = await Promise.all([
    etatDevinette(base, catalogue, moi, mode.data, jour),
    base.prepare("SELECT eclats FROM comptes WHERE id = ?").bind(moi).first<{ eclats: number }>(),
  ]);
  return c.json({ juste, gain, solde: solde?.eclats ?? 0, etat });
});

// ---------- Memory ----------

/** 8 cartes de ma collection (complétées par le catalogue si j'en ai moins), placées au hasard sur 16 cases. */
function grilleMemory(collection: readonly CarteCatalogue[], catalogue: Catalogue, alea: Aleatoire): string[] {
  const jouable = (c: CarteCatalogue) => c.orientation === "portrait" && !["Rune", "Token", "Battlefield"].includes(c.type);
  const choisies: CarteCatalogue[] = [];
  const images = new Set<string>();
  const piocher = (source: readonly CarteCatalogue[]) => {
    const pool = source.filter((c) => jouable(c) && !images.has(c.image));
    while (choisies.length < PAIRES_MEMORY && pool.length) {
      const [carte] = pool.splice(Math.floor(alea() * pool.length), 1);
      if (carte && !images.has(carte.image)) {
        images.add(carte.image);
        choisies.push(carte);
      }
    }
  };
  piocher(collection);
  piocher(catalogue.cartes.filter((c) => c.variante === "base"));
  const grille = choisies.flatMap((c) => [c.code, c.code]);
  for (let i = grille.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [grille[i], grille[j]] = [grille[j] as string, grille[i] as string];
  }
  return grille;
}

/** Nouvelle partie (la partie en cours, s'il y en a une, est abandonnée). */
routesMiniJeux.post("/memory", async (c) => {
  const moi = idCompte(c);
  const base = c.env.BASE_DE_DONNEES;
  if (!(await compterTentative(base, `memory:compte:${moi}`, REGLES.memoryParCompte)).autorisee) {
    return c.json({ erreur: "trop_de_requetes" }, 429);
  }
  const [catalogue, possedees] = await Promise.all([
    obtenirCatalogue(),
    base.prepare("SELECT DISTINCT card_code FROM collection WHERE compte_id = ? AND quantite > 0").bind(moi).all<{ card_code: string }>(),
  ]);
  const parCode = new Map(catalogue.cartes.map((carte) => [carte.code, carte]));
  const collection = possedees.results.flatMap((l) => parCode.get(l.card_code) ?? []);
  const grille = grilleMemory(collection, catalogue, aleatoireCrypto());
  if (grille.length !== PAIRES_MEMORY * 2) return c.json({ erreur: "catalogue_indisponible" }, 503);

  const jour = jourDeParis(Date.now());
  const [, cree, gains] = await base.batch([
    base.prepare("DELETE FROM parties_memory WHERE compte_id = ? AND terminee = 0").bind(moi),
    base
      .prepare("INSERT INTO parties_memory (compte_id, jour, grille, cree_le) VALUES (?, ?, ?, ?) RETURNING id")
      .bind(moi, jour, JSON.stringify(grille), Date.now()),
    base.prepare("SELECT COALESCE(SUM(gain), 0) AS n FROM parties_memory WHERE compte_id = ? AND jour = ? AND terminee = 1").bind(moi, jour),
  ]);
  return c.json(
    {
      id: (cree?.results[0] as { id: number } | undefined)?.id,
      cases: grille.length,
      gainsDuJour: (gains?.results[0] as { n: number } | undefined)?.n ?? 0,
      plafond: PLAFOND_MEMORY_JOUR,
    },
    201,
  );
});

interface LigneMemory {
  jour: string;
  grille: string;
  trouvees: string;
  retournee: number | null;
  coups: number;
  terminee: number;
}

/** Retourne une case. 1re carte du coup : on la montre. 2e : on dit si c'est une paire, et on crédite la fin de partie. */
routesMiniJeux.post("/memory/:id/retourner", async (c) => {
  const moi = idCompte(c);
  const base = c.env.BASE_DE_DONNEES;
  const id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).safeParse(c.req.param("id"));
  if (!id.success) return c.json({ erreur: "donnees_invalides" }, 400);
  const corps = await lireCorps(c, z.object({ position: z.number().int().min(0).max(PAIRES_MEMORY * 2 - 1) }).strict());
  if (!corps.ok) return corps.reponse;
  const position = corps.donnees.position;

  const partie = await base
    .prepare("SELECT jour, grille, trouvees, retournee, coups, terminee FROM parties_memory WHERE id = ? AND compte_id = ?")
    .bind(id.data, moi)
    .first<LigneMemory>();
  if (!partie) return c.json({ erreur: "partie_introuvable" }, 404);
  if (partie.terminee) return c.json({ erreur: "partie_terminee" }, 409);
  const grille = JSON.parse(partie.grille) as string[];
  const trouvees = JSON.parse(partie.trouvees) as number[];
  if (trouvees.includes(position) || partie.retournee === position) return c.json({ erreur: "case_deja_retournee" }, 409);

  const catalogue = await obtenirCatalogue();
  const parCode = new Map(catalogue.cartes.map((carte) => [carte.code, carte]));
  const carteEn = (pos: number) => {
    const code = grille[pos] ?? "";
    const carte = parCode.get(code);
    return { code, nom: carte?.nom ?? code, image: carte?.image ?? "" };
  };

  if (partie.retournee === null) {
    const r = await base
      .prepare("UPDATE parties_memory SET retournee = ? WHERE id = ? AND retournee IS NULL AND coups = ? AND terminee = 0")
      .bind(position, id.data, partie.coups)
      .run();
    if (!r.meta.changes) return c.json({ erreur: "conflit_partie" }, 409);
    return c.json({ position, carte: carteEn(position), coups: partie.coups });
  }

  const premiere = partie.retournee;
  const paire = grille[premiere] === grille[position];
  const coups = partie.coups + 1;
  const nouvelles = paire ? [...trouvees, premiere, position] : trouvees;
  const terminee = nouvelles.length === grille.length;
  let gain = 0;
  if (terminee) {
    const deja = await base
      .prepare("SELECT COALESCE(SUM(gain), 0) AS n FROM parties_memory WHERE compte_id = ? AND jour = ? AND terminee = 1")
      .bind(moi, partie.jour)
      .first<{ n: number }>();
    gain = Math.max(0, Math.min(gainMemory(coups), PLAFOND_MEMORY_JOUR - (deja?.n ?? 0)));
  }
  const [ecrit] = await base.batch([
    base
      .prepare(
        `UPDATE parties_memory SET retournee = NULL, coups = ?, trouvees = ?, terminee = ?, gain = ?
         WHERE id = ? AND retournee = ? AND coups = ? AND terminee = 0 RETURNING id`,
      )
      .bind(coups, JSON.stringify(nouvelles), terminee ? 1 : 0, gain, id.data, premiere, partie.coups),
    base
      .prepare(
        `UPDATE comptes SET eclats = eclats + (SELECT gain FROM parties_memory WHERE id = ?1 AND terminee = 1 AND gain_credite = 0)
         WHERE id = ?2 AND EXISTS (SELECT 1 FROM parties_memory WHERE id = ?1 AND terminee = 1 AND gain_credite = 0)`,
      )
      .bind(id.data, moi),
    base.prepare("UPDATE parties_memory SET gain_credite = 1 WHERE id = ? AND terminee = 1").bind(id.data),
  ]);
  if (!ecrit?.results.length) return c.json({ erreur: "conflit_partie" }, 409);

  const solde = terminee ? await base.prepare("SELECT eclats FROM comptes WHERE id = ?").bind(moi).first<{ eclats: number }>() : null;
  return c.json({
    position,
    carte: carteEn(position),
    premiere: { position: premiere, carte: carteEn(premiere) },
    paire,
    coups,
    terminee,
    gain,
    ...(solde ? { solde: solde.eclats } : {}),
  });
});
