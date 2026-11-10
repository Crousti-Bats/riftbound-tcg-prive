import { describe, expect, it } from "vitest";
import type { Carte } from "./libelles-cartes";
import { type VueTable, cartesZone, nombreZone, texteJournal } from "./table";

describe("Table de jeu (navigateur)", () => {
  it("remplace {0}, {1}… par le nom des cartes, « une carte » si elle est inconnue", () => {
    const cartes = { "x-1": { nom: "Ekko", sousTitre: "Recurrent" } as Carte };
    expect(texteJournal({ t: 0, j: 0, texte: "Alice déplace {0} et {1}.", cartes: ["x-1", "x-2"] }, cartes)).toBe(
      "Alice déplace Ekko, Recurrent et une carte.",
    );
  });

  it("lit une zone visible (cartes) ou cachée (nombre)", () => {
    const vue = { zones: { "0.main": [{ id: "c1" }], "1.main": 5 } } as unknown as VueTable;
    expect(cartesZone(vue, "0.main")).toHaveLength(1);
    expect(cartesZone(vue, "1.main")).toEqual([]);
    expect(nombreZone(vue, "1.main")).toBe(5);
    expect(nombreZone(vue, "0.main")).toBe(1);
    expect(nombreZone(vue, "0.inconnue")).toBe(0);
  });
});
