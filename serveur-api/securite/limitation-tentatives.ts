/**
 * Limitation des tentatives (anti force brute et anti-spam), stockée dans D1.
 * Une clé (ex. "connexion:ip:1.2.3.4") a un compteur sur une fenêtre de temps fixe.
 *
 * Étape 10 : chaque tentative est COMPTÉE AVANT d'être traitée, en une seule requête atomique
 * (incrément + lecture du résultat). L'ancienne façon (« vérifier, puis compter l'échec plus tard »)
 * laissait passer des dizaines de requêtes envoyées en même temps, qui lisaient toutes un compteur bas.
 * Une tentative réussie est ensuite « remboursée » (ou le compteur remis à zéro) : seuls les échecs restent comptés.
 */

export interface RegleLimitation {
  maximum: number;
  fenetreMs: number;
}

export const REGLES = {
  connexionParIp: { maximum: 20, fenetreMs: 15 * 60_000 },
  connexionParPseudo: { maximum: 5, fenetreMs: 15 * 60_000 },
  /** Appareil où le compte s'est déjà connecté : compteur à part, que les autres ne peuvent pas remplir. */
  connexionParAppareil: { maximum: 5, fenetreMs: 15 * 60_000 },
  inscriptionParIp: { maximum: 10, fenetreMs: 60 * 60_000 },
  reinitialisationParIp: { maximum: 10, fenetreMs: 60 * 60_000 },
  /** Anti-spam : messages et annonces par compte (compteur, pas des échecs). */
  messagesParCompte: { maximum: 20, fenetreMs: 60_000 },
  /** Plafond journalier : protège le quota gratuit d'écritures D1 (100 000 par jour). */
  messagesParJour: { maximum: 500, fenetreMs: 24 * 60 * 60_000 },
  elevationAdmin: { maximum: 5, fenetreMs: 15 * 60_000 },
  /** Enregistrements du profil (bio, avatar, vitrine) : protège le quota d'écritures D1. */
  profilParCompte: { maximum: 30, fenetreMs: 60 * 60_000 },
} satisfies Record<string, RegleLimitation>;

export interface ResultatTentative {
  /** Faux : la limite est dépassée, la requête doit être refusée (429). */
  autorisee: boolean;
  /** Vrai seulement pour le PREMIER refus de la fenêtre : permet de journaliser un blocage une seule fois. */
  premierRefus: boolean;
}

/**
 * Compte une tentative de façon atomique et dit si elle est autorisée.
 * Fenêtre expirée : le compteur repart à 1.
 * (SQLite évalue toutes les expressions du SET avec les valeurs d'AVANT la mise à jour.)
 */
export async function compterTentative(base: D1Database, cle: string, regle: RegleLimitation): Promise<ResultatTentative> {
  const maintenant = Date.now();
  const limite = maintenant - regle.fenetreMs;
  const ligne = await base
    .prepare(
      `INSERT INTO limitations (cle, nombre, debut_fenetre) VALUES (?, 1, ?)
       ON CONFLICT (cle) DO UPDATE SET
         nombre = CASE WHEN debut_fenetre <= ? THEN 1 ELSE nombre + 1 END,
         debut_fenetre = CASE WHEN debut_fenetre <= ? THEN ? ELSE debut_fenetre END
       RETURNING nombre`,
    )
    .bind(cle, maintenant, limite, limite, maintenant)
    .first<{ nombre: number }>();
  const nombre = ligne?.nombre ?? 1;
  return { autorisee: nombre <= regle.maximum, premierRefus: nombre === regle.maximum + 1 };
}

/** Annule une tentative comptée qui a réussi (le compteur ne garde que les échecs). */
export async function rembourserTentative(base: D1Database, cle: string): Promise<void> {
  await base.prepare("UPDATE limitations SET nombre = MAX(nombre - 1, 0) WHERE cle = ?").bind(cle).run();
}

export async function reinitialiser(base: D1Database, cle: string): Promise<void> {
  await base.prepare("DELETE FROM limitations WHERE cle = ?").bind(cle).run();
}

/**
 * Partie de l'adresse IP utilisée dans les clés de limitation.
 * IPv4 : l'adresse entière. IPv6 : le préfixe /64, car un seul abonné dispose en général de tout ce bloc
 * (des milliards d'adresses) : limiter adresse par adresse ne le freinerait pas.
 */
export function ipPourLimitation(ip: string): string {
  if (!ip.includes(":")) return ip;
  // Adresse IPv4 écrite en IPv6 (::ffff:1.2.3.4) : on garde l'IPv4.
  const ipv4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (ipv4?.[1]) return ipv4[1];
  const [gauche = "", droite] = ip.toLowerCase().split("::");
  const groupesGauche = gauche ? gauche.split(":") : [];
  const groupesDroite = droite ? droite.split(":") : [];
  const zeros = droite === undefined ? [] : Array<string>(Math.max(0, 8 - groupesGauche.length - groupesDroite.length)).fill("0");
  const groupes = [...groupesGauche, ...zeros, ...groupesDroite];
  if (groupes.length !== 8 || !groupes.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return ip;
  return `${groupes.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
