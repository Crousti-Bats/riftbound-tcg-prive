/**
 * Fausse base D1 pour les tests : une vraie base SQLite en mémoire (node:sqlite),
 * initialisée avec les VRAIES migrations du dossier base-de-donnees/migrations.
 * Elle reproduit l'interface D1 utilisée par l'API : prepare/bind/first/all/run/batch.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";

const DOSSIER_MIGRATIONS = fileURLToPath(new URL("../../../base-de-donnees/migrations", import.meta.url).href);

const RENVOIE_DES_LIGNES = /^\s*(SELECT|WITH)\b|\bRETURNING\b/i;

class RequetePreparee {
  constructor(
    private readonly bd: DatabaseSync,
    readonly sql: string,
    private readonly valeurs: SQLInputValue[] = [],
  ) {}

  bind(...valeurs: unknown[]) {
    for (const v of valeurs) if (v === undefined) throw new Error("D1_TYPE_ERROR: undefined n'est pas une valeur SQL");
    return new RequetePreparee(this.bd, this.sql, valeurs as SQLInputValue[]);
  }

  async first<T>(colonne?: string): Promise<T | null> {
    const ligne = this.bd.prepare(this.sql).get(...this.valeurs) as Record<string, unknown> | undefined;
    if (!ligne) return null;
    return (colonne ? ligne[colonne] : { ...ligne }) as T;
  }

  async all<T>() {
    return this.executer<T>();
  }

  async run<T>() {
    return this.executer<T>();
  }

  executer<T>() {
    const instruction = this.bd.prepare(this.sql);
    if (RENVOIE_DES_LIGNES.test(this.sql)) {
      const lignes = instruction.all(...this.valeurs).map((l) => ({ ...l })) as T[];
      return { success: true, results: lignes, meta: { changes: lignes.length, last_row_id: 0 } };
    }
    const r = instruction.run(...this.valeurs);
    return {
      success: true,
      results: [] as T[],
      meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
    };
  }
}

export function creerBaseDeTest() {
  const bd = new DatabaseSync(":memory:");
  bd.exec("PRAGMA foreign_keys = ON;");
  for (const fichier of readdirSync(DOSSIER_MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    bd.exec(readFileSync(join(DOSSIER_MIGRATIONS, fichier), "utf8"));
  }

  const d1 = {
    prepare: (sql: string) => new RequetePreparee(bd, sql),
    /** Comme D1 : toutes les requêtes du lot réussissent ou aucune (transaction). */
    batch: async (requetes: RequetePreparee[]) => {
      bd.exec("BEGIN");
      try {
        const resultats = requetes.map((r) => r.executer());
        bd.exec("COMMIT");
        return resultats;
      } catch (e) {
        bd.exec("ROLLBACK");
        throw e;
      }
    },
    exec: async (sql: string) => {
      bd.exec(sql);
      return { count: 1, duration: 0 };
    },
  };

  return { bd, d1: d1 as unknown as D1Database };
}
