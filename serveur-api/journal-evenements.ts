/** Journal des événements de sécurité et des actions admin (table `journal`). */

export type CategorieJournal = "securite" | "admin";

export interface EvenementJournal {
  categorie: CategorieJournal;
  type: string;
  compteId?: number | null;
  pseudo?: string | null;
  ip?: string | null;
  details?: Record<string, unknown>;
}

export function requeteJournal(base: D1Database, e: EvenementJournal): D1PreparedStatement {
  return base
    .prepare("INSERT INTO journal (horodatage, categorie, type, compte_id, pseudo, ip, details) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(
      Date.now(),
      e.categorie,
      e.type,
      e.compteId ?? null,
      e.pseudo ?? null,
      e.ip ?? null,
      e.details ? JSON.stringify(e.details) : null,
    );
}

export async function journaliser(base: D1Database, e: EvenementJournal): Promise<void> {
  await requeteJournal(base, e).run();
}
