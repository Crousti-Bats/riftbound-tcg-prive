/**
 * Limitation des tentatives (anti force brute), stockée dans D1.
 * Une clé (ex. "connexion:ip:1.2.3.4") a un compteur sur une fenêtre de temps glissante simple.
 */

export interface RegleLimitation {
  maximum: number;
  fenetreMs: number;
}

export const REGLES = {
  connexionParIp: { maximum: 20, fenetreMs: 15 * 60_000 },
  connexionParPseudo: { maximum: 5, fenetreMs: 15 * 60_000 },
  inscriptionParIp: { maximum: 10, fenetreMs: 60 * 60_000 },
  elevationAdmin: { maximum: 5, fenetreMs: 15 * 60_000 },
} satisfies Record<string, RegleLimitation>;

/** Vrai si la clé a atteint la limite (la requête doit être refusée). */
export async function estBloque(base: D1Database, cle: string, regle: RegleLimitation): Promise<boolean> {
  const ligne = await base
    .prepare("SELECT nombre, debut_fenetre FROM limitations WHERE cle = ?")
    .bind(cle)
    .first<{ nombre: number; debut_fenetre: number }>();
  if (!ligne) return false;
  if (ligne.debut_fenetre + regle.fenetreMs <= Date.now()) return false;
  return ligne.nombre >= regle.maximum;
}

/** Enregistre un échec. Si la fenêtre est expirée, le compteur repart à 1. */
export async function enregistrerEchec(base: D1Database, cle: string, regle: RegleLimitation): Promise<void> {
  const maintenant = Date.now();
  const limite = maintenant - regle.fenetreMs;
  await base
    .prepare(
      `INSERT INTO limitations (cle, nombre, debut_fenetre) VALUES (?, 1, ?)
       ON CONFLICT (cle) DO UPDATE SET
         nombre = CASE WHEN debut_fenetre <= ? THEN 1 ELSE nombre + 1 END,
         debut_fenetre = CASE WHEN debut_fenetre <= ? THEN ? ELSE debut_fenetre END`,
    )
    .bind(cle, maintenant, limite, limite, maintenant)
    .run();
}

export async function reinitialiser(base: D1Database, cle: string): Promise<void> {
  await base.prepare("DELETE FROM limitations WHERE cle = ?").bind(cle).run();
}
