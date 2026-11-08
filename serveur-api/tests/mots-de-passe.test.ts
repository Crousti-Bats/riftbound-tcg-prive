import { describe, expect, it } from "vitest";
import { HASH_FACTICE, hacherMotDePasse, verifierMotDePasse } from "../securite/mots-de-passe";

describe("Hachage des mots de passe (PBKDF2-SHA256)", () => {
  it("vérifie le bon mot de passe et refuse un mauvais", async () => {
    const hash = await hacherMotDePasse("correct-horse-battery");
    expect(await verifierMotDePasse("correct-horse-battery", hash)).toBe(true);
    expect(await verifierMotDePasse("correct-horse-batterY", hash)).toBe(false);
  });

  it("utilise un sel aléatoire : deux hachages du même mot de passe diffèrent", async () => {
    expect(await hacherMotDePasse("identique-identique")).not.toBe(await hacherMotDePasse("identique-identique"));
  });

  it("refuse un hash mal formé ou d'un autre algorithme", async () => {
    for (const mauvais of ["", "n'importe quoi", "md5$1$a$b", "pbkdf2-sha256$abc$a$b"]) {
      expect(await verifierMotDePasse("x", mauvais)).toBe(false);
    }
  });

  it("le hash factice ne correspond à aucun mot de passe courant", async () => {
    expect(await verifierMotDePasse("", HASH_FACTICE)).toBe(false);
    expect(await verifierMotDePasse("motdepasse", HASH_FACTICE)).toBe(false);
  });
});
