/** Vérifie que la règle ESLint bloque bien le SQL non préparé (et laisse passer le SQL correct). */
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const racine = fileURLToPath(new URL("../../", import.meta.url).href);
const eslint = new ESLint({ cwd: racine, overrideConfigFile: "configuration/qualite-code-eslint.config.js" });

async function erreursSql(code: string): Promise<number> {
  const [resultat] = await eslint.lintText(code, { filePath: "serveur-api/exemple.ts" });
  return (resultat?.messages ?? []).filter((m) => m.message.startsWith("SQL non préparé")).length;
}

describe("Règle ESLint : SQL préparé obligatoire", () => {
  it("accepte un SQL fixe avec des ? et .bind()", async () => {
    expect(await erreursSql(`declare const db: any; declare const p: string;
      db.prepare("SELECT * FROM comptes WHERE pseudo = ?").bind(p);
      db.prepare(\`SELECT 1\`);`)).toBe(0);
  });

  it("refuse une interpolation ${...}", async () => {
    expect(await erreursSql("declare const db: any; declare const p: string; db.prepare(`SELECT * FROM comptes WHERE pseudo = '${p}'`);")).toBe(1);
  });

  it("refuse une concaténation", async () => {
    expect(await erreursSql(`declare const db: any; declare const p: string; db.prepare("SELECT * FROM comptes WHERE pseudo = '" + p + "'");`)).toBe(1);
  });

  it("refuse une variable", async () => {
    expect(await erreursSql(`declare const db: any; declare const sql: string; db.prepare(sql);`)).toBe(1);
  });
});
