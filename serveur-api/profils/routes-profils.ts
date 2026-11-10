/**
 * Routes /api/profils : profil public d'un joueur (avatar, bio, vitrine, statistiques) et personnalisation du sien.
 *
 * Règles (décidées par l'utilisateur le 2026-11-10) :
 * - avatar = illustration d'une carte que l'on possède au moment du choix ; il reste si on l'échange ensuite ;
 * - vitrine = 6 cartes possédées au maximum, dans l'ordre choisi ; une carte qui n'est plus possédée
 *   disparaît d'elle-même de la vitrine (filtrée à la lecture) ;
 * - bio = texte brut de 200 caractères (affiché par React, jamais interprété comme du HTML).
 *
 * Aucun fichier envoyé, aucune image hébergée : seulement des cardCode en base, les images viennent du CDN Riot.
 * Modération : un admin dont l'accès admin est ouvert peut effacer une bio (journalisé).
 */
import { type Context, Hono } from "hono";
import { z } from "zod";
import { exigerConnexion } from "../authentification/sessions";
import { obtenirCatalogue } from "../catalogue/source-cartes";
import type { CarteCatalogue } from "../catalogue/types-catalogue";
import { journaliser } from "../journal-evenements";
import { lireCorps } from "../lecture-requete";
import { compterTentative, REGLES } from "../securite/limitation-tentatives";
import type { CompteConnecte, ContexteApi } from "../types-application";
import { schemaPseudo } from "../validation-donnees";
import { avatarAffiche, verifierPhoto } from "./avatar";

export const routesProfils = new Hono<ContexteApi>();

routesProfils.use("*", exigerConnexion);

export const TAILLE_VITRINE = 6;
export const LONGUEUR_BIO = 200;

const schemaCode = z.string().regex(/^[a-z0-9-]{3,40}$/);

/**
 * Bio : retours à la ligne normalisés (3 lignes vides ou plus → une seule), caractères de contrôle refusés,
 * caractères d'inversion du sens d'écriture (bidi) retirés : ils servent à maquiller un texte.
 */
const schemaBio = z
  .string()
  .max(400)
  .transform((t) =>
    t
      .replace(/\r\n?/g, "\n")
      .replace(/[‪-‮⁦-⁩]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  )
  .refine((t) => t.length <= LONGUEUR_BIO, `${LONGUEUR_BIO} caractères maximum`)
  // eslint-disable-next-line no-control-regex
  .refine((t) => !/[\u0000-\u0009\u000B-\u001F\u007F]/.test(t), "caractères non autorisés");

const schemaProfil = z.strictObject({
  bio: schemaBio,
  avatar: schemaCode.nullable(),
  vitrine: z
    .array(z.strictObject({ code: schemaCode, foil: z.boolean() }))
    .max(TAILLE_VITRINE, `${TAILLE_VITRINE} cartes maximum`)
    .refine((l) => new Set(l.map((x) => `${x.code}|${x.foil}`)).size === l.length, "carte en double"),
});

function moi(c: Context<ContexteApi>): CompteConnecte {
  const compte = c.get("compte");
  if (!compte) throw new Error("compte absent après exigerConnexion");
  return compte;
}

const estModerateur = (compte: CompteConnecte) => compte.role === "admin" && compte.adminJusqua > Date.now();

async function cartesParCode(): Promise<Map<string, CarteCatalogue>> {
  return new Map((await obtenirCatalogue()).cartes.map((carte) => [carte.code, carte]));
}

interface LigneJoueur {
  id: number;
  pseudo: string;
  cree_le: number;
  bio: string | null;
  avatar_card_code: string | null;
  avatar_photo_le: number | null;
}

/** Mon avatar seul (barre de navigation) : lecture légère, sans statistiques. */
routesProfils.get("/avatar", async (c) => {
  const compte = moi(c);
  const ligne = await c.env.BASE_DE_DONNEES.prepare("SELECT avatar_card_code, avatar_photo_le FROM comptes WHERE id = ?")
    .bind(compte.id)
    .first<{ avatar_card_code: string | null; avatar_photo_le: number | null }>();
  const parCode = ligne?.avatar_card_code ? await cartesParCode() : new Map<string, CarteCatalogue>();
  return c.json({
    avatar: avatarAffiche(parCode, { id: compte.id, carte: ligne?.avatar_card_code ?? null, photoLe: ligne?.avatar_photo_le ?? null }),
  });
});

/** Profil public d'un joueur. */
routesProfils.get("/joueur/:pseudo", async (c) => {
  const compte = moi(c);
  const base = c.env.BASE_DE_DONNEES;
  const pseudo = schemaPseudo.safeParse(c.req.param("pseudo"));
  if (!pseudo.success) return c.json({ erreur: "joueur_introuvable" }, 404);
  const joueur = await base
    .prepare("SELECT id, pseudo, cree_le, bio, avatar_card_code, avatar_photo_le FROM comptes WHERE pseudo = ? AND actif = 1")
    .bind(pseudo.data)
    .first<LigneJoueur>();
  if (!joueur) return c.json({ erreur: "joueur_introuvable" }, 404);

  const [vitrine, possession, boosters, echanges, souhaits] = await base.batch([
    // Seulement les cartes encore possédées (normale ou foil, selon ce qui a été exposé).
    base
      .prepare(
        `SELECT v.card_code, v.est_foil FROM vitrine v
         WHERE v.compte_id = ? AND EXISTS (
           SELECT 1 FROM collection x WHERE x.compte_id = v.compte_id AND x.card_code = v.card_code
             AND x.est_foil = v.est_foil AND x.quantite > 0)
         ORDER BY v.position`,
      )
      .bind(joueur.id),
    base.prepare("SELECT card_code, quantite FROM collection WHERE compte_id = ? AND quantite > 0").bind(joueur.id),
    base.prepare("SELECT COUNT(*) AS n FROM ouvertures_boosters WHERE compte_id = ?").bind(joueur.id),
    base
      .prepare("SELECT COUNT(*) AS n FROM echanges WHERE statut = 'accepte' AND (auteur_id = ? OR destinataire_id = ?)")
      .bind(joueur.id, joueur.id),
    // Wishlist : les cartes recherchées pas encore obtenues, avec ce que JE (le visiteur) en possède.
    base
      .prepare(
        `SELECT w.card_code,
                COALESCE((SELECT SUM(m.quantite) FROM collection m WHERE m.compte_id = ? AND m.card_code = w.card_code), 0) AS moi
         FROM wishlist w
         WHERE w.compte_id = ?
           AND NOT EXISTS (SELECT 1 FROM collection x WHERE x.compte_id = w.compte_id AND x.card_code = w.card_code AND x.quantite > 0)
         ORDER BY w.ajoutee_le DESC LIMIT 100`,
      )
      .bind(compte.id, joueur.id),
  ]);

  const catalogue = await obtenirCatalogue();
  const parCode = new Map(catalogue.cartes.map((carte) => [carte.code, carte]));

  let totalCartes = 0;
  const distinctes = new Set<string>();
  const baseParSet = new Map<string, number>();
  for (const ligne of possession?.results as Array<{ card_code: string; quantite: number }>) {
    totalCartes += ligne.quantite;
    if (distinctes.has(ligne.card_code)) continue; // normale et foil de la même carte
    distinctes.add(ligne.card_code);
    const carte = parCode.get(ligne.card_code);
    if (carte?.variante === "base") baseParSet.set(carte.set, (baseParSet.get(carte.set) ?? 0) + 1);
  }

  return c.json({
    pseudo: joueur.pseudo,
    estMoi: joueur.id === compte.id,
    peutModerer: estModerateur(compte) && joueur.id !== compte.id,
    membreDepuis: joueur.cree_le,
    bio: joueur.bio ?? "",
    avatar: joueur.avatar_card_code ? (parCode.get(joueur.avatar_card_code) ?? null) : null,
    /** Photo personnelle (adresse) : si elle existe, elle s'affiche à la place de l'avatar « carte ». */
    photo: avatarAffiche(parCode, { id: joueur.id, carte: null, photoLe: joueur.avatar_photo_le })?.image ?? null,
    vitrine: (vitrine?.results as Array<{ card_code: string; est_foil: number }>)
      .map((v) => ({ carte: parCode.get(v.card_code) ?? null, foil: v.est_foil === 1 }))
      .filter((v): v is { carte: CarteCatalogue; foil: boolean } => v.carte !== null),
    wishlist: (souhaits?.results as Array<{ card_code: string; moi: number }>).flatMap((w) => {
      const carte = parCode.get(w.card_code);
      return carte ? [{ carte, jePossede: w.moi }] : [];
    }),
    statistiques: {
      totalCartes,
      cartesDistinctes: distinctes.size,
      boostersOuverts: (boosters?.results[0] as { n: number } | undefined)?.n ?? 0,
      echangesReussis: (echanges?.results[0] as { n: number } | undefined)?.n ?? 0,
      completion: catalogue.sets.map((s) => ({
        code: s.code,
        nom: s.nom,
        possedees: baseParSet.get(s.code) ?? 0,
        total: s.parVariante.base ?? 0,
      })),
    },
  });
});

/** Enregistre mon profil (remplace la bio, l'avatar et toute la vitrine en une seule transaction). */
routesProfils.post("/", async (c) => {
  const compte = moi(c);
  const base = c.env.BASE_DE_DONNEES;
  const lecture = await lireCorps(c, schemaProfil);
  if (!lecture.ok) return lecture.reponse;
  const { bio, avatar, vitrine } = lecture.donnees;

  const parCode = await cartesParCode();
  if ((avatar && !parCode.has(avatar)) || vitrine.some((v) => !parCode.has(v.code))) {
    return c.json({ erreur: "carte_introuvable" }, 404);
  }

  // Possession vérifiée par le serveur : l'avatar (normale ou foil) et chaque carte de la vitrine.
  const { results } = await base
    .prepare("SELECT card_code, est_foil FROM collection WHERE compte_id = ? AND quantite > 0")
    .bind(compte.id)
    .all<{ card_code: string; est_foil: number }>();
  const possedees = new Set(results.map((r) => `${r.card_code}|${r.est_foil === 1}`));
  const avatarActuel = await base
    .prepare("SELECT avatar_card_code FROM comptes WHERE id = ?")
    .bind(compte.id)
    .first<{ avatar_card_code: string | null }>();
  // On peut garder un avatar qu'on n'a plus (échangé depuis), mais pas en choisir un nouveau sans l'avoir.
  const avatarAutorise =
    !avatar || avatar === avatarActuel?.avatar_card_code || possedees.has(`${avatar}|false`) || possedees.has(`${avatar}|true`);
  if (!avatarAutorise || vitrine.some((v) => !possedees.has(`${v.code}|${v.foil}`))) {
    return c.json({ erreur: "cartes_non_possedees" }, 409);
  }

  // Protège le quota d'écritures D1 : 30 enregistrements par heure et par compte (comptage atomique).
  if (!(await compterTentative(base, `profil:compte:${compte.id}`, REGLES.profilParCompte)).autorisee) {
    return c.json({ erreur: "trop_de_modifications" }, 429);
  }

  await base.batch([
    base.prepare("UPDATE comptes SET bio = ?, avatar_card_code = ? WHERE id = ?").bind(bio || null, avatar, compte.id),
    base.prepare("DELETE FROM vitrine WHERE compte_id = ?").bind(compte.id),
    ...vitrine.map((v, position) =>
      base
        .prepare("INSERT INTO vitrine (compte_id, position, card_code, est_foil) VALUES (?, ?, ?, ?)")
        .bind(compte.id, position, v.code, v.foil ? 1 : 0),
    ),
  ]);
  return c.json({ ok: true });
});

/** Modération : un admin (accès admin ouvert) efface la bio d'un joueur. */
routesProfils.delete("/joueur/:pseudo/bio", async (c) => {
  const compte = moi(c);
  if (!estModerateur(compte)) return c.json({ erreur: "interdit" }, 403);
  const pseudo = schemaPseudo.safeParse(c.req.param("pseudo"));
  if (!pseudo.success) return c.json({ erreur: "joueur_introuvable" }, 404);
  const base = c.env.BASE_DE_DONNEES;
  const joueur = await base
    .prepare("UPDATE comptes SET bio = NULL WHERE pseudo = ? AND bio IS NOT NULL RETURNING id, pseudo")
    .bind(pseudo.data)
    .first<{ id: number; pseudo: string }>();
  if (!joueur) return c.json({ erreur: "joueur_introuvable" }, 404);
  await journaliser(base, {
    categorie: "admin",
    type: "bio_effacee",
    compteId: compte.id,
    pseudo: compte.pseudo,
    details: { joueur: joueur.pseudo },
  });
  return c.json({ ok: true });
});

// ---------- Photo de profil personnelle ----------

const schemaPhoto = z.strictObject({ image: z.string().min(16).max(210_000) });

/** Envoie (ou remplace) ma photo. Le navigateur l'a déjà recadrée en 256 x 256 ; le serveur vérifie tout. */
routesProfils.post("/photo", async (c) => {
  const compte = moi(c);
  const base = c.env.BASE_DE_DONNEES;
  const lecture = await lireCorps(c, schemaPhoto);
  if (!lecture.ok) return lecture.reponse;
  const photo = verifierPhoto(lecture.donnees.image);
  if (!photo) return c.json({ erreur: "photo_invalide" }, 400);
  if (!(await compterTentative(base, `profil:compte:${compte.id}`, REGLES.profilParCompte)).autorisee) {
    return c.json({ erreur: "trop_de_modifications" }, 429);
  }
  const maintenant = Date.now();
  await base.batch([
    base
      .prepare(
        `INSERT INTO photos_profil (compte_id, type, donnees, maj_le) VALUES (?, ?, ?, ?)
         ON CONFLICT (compte_id) DO UPDATE SET type = excluded.type, donnees = excluded.donnees, maj_le = excluded.maj_le`,
      )
      .bind(compte.id, photo.type, photo.base64, maintenant),
    base.prepare("UPDATE comptes SET avatar_photo_le = ? WHERE id = ?").bind(maintenant, compte.id),
  ]);
  return c.json({ ok: true, photo: avatarAffiche(new Map(), { id: compte.id, carte: null, photoLe: maintenant })?.image }, 201);
});

async function supprimerPhoto(base: D1Database, compteId: number): Promise<boolean> {
  const [suppression] = await base.batch([
    base.prepare("DELETE FROM photos_profil WHERE compte_id = ?").bind(compteId),
    base.prepare("UPDATE comptes SET avatar_photo_le = NULL WHERE id = ?").bind(compteId),
  ]);
  return (suppression?.meta.changes ?? 0) > 0;
}

/** Retire ma photo (l'avatar « carte », s'il y en a un, revient). */
routesProfils.delete("/photo", async (c) => {
  await supprimerPhoto(c.env.BASE_DE_DONNEES, moi(c).id);
  return c.json({ ok: true });
});

/**
 * Affiche une photo (réservé aux joueurs connectés, comme tout le site). Adresse versionnée : mise en cache
 * longue dans le navigateur. En-têtes stricts : le navigateur ne doit jamais l'interpréter autrement qu'en image.
 */
routesProfils.get("/photo/:id", async (c) => {
  const id = z.coerce.number().int().positive().safeParse(c.req.param("id"));
  if (!id.success) return c.json({ erreur: "introuvable" }, 404);
  const ligne = await c.env.BASE_DE_DONNEES.prepare(
    "SELECT p.type, p.donnees FROM photos_profil p JOIN comptes c ON c.id = p.compte_id WHERE p.compte_id = ? AND c.actif = 1",
  )
    .bind(id.data)
    .first<{ type: string; donnees: string }>();
  if (!ligne) return c.json({ erreur: "introuvable" }, 404);
  const octets = Uint8Array.from(atob(ligne.donnees), (car) => car.charCodeAt(0));
  return new Response(octets, {
    headers: {
      "Content-Type": ligne.type,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
    },
  });
});

/** Modération : un admin (accès admin ouvert) retire la photo d'un joueur (journalisé). */
routesProfils.delete("/joueur/:pseudo/photo", async (c) => {
  const compte = moi(c);
  if (!estModerateur(compte)) return c.json({ erreur: "interdit" }, 403);
  const pseudo = schemaPseudo.safeParse(c.req.param("pseudo"));
  if (!pseudo.success) return c.json({ erreur: "joueur_introuvable" }, 404);
  const base = c.env.BASE_DE_DONNEES;
  const joueur = await base.prepare("SELECT id, pseudo FROM comptes WHERE pseudo = ?").bind(pseudo.data).first<{ id: number; pseudo: string }>();
  if (!joueur || !(await supprimerPhoto(base, joueur.id))) return c.json({ erreur: "joueur_introuvable" }, 404);
  await journaliser(base, { categorie: "admin", type: "photo_retiree", compteId: compte.id, pseudo: compte.pseudo, details: { joueur: joueur.pseudo } });
  return c.json({ ok: true });
});
