import { describe, expect, it } from "vitest";
import type { Carte } from "./libelles-cartes";
import { calculerPaiement, libelleCout } from "./paiement";

const carte = (code: string, domaines: string[], energie: number | null = null, puissance: number | null = null) =>
  ({ code, nom: code, domaines, energie, puissance, type: "Unit" }) as unknown as Carte;
const CARTES: Record<string, Carte> = { fury: carte("fury", ["Fury"]), chaos: carte("chaos", ["Chaos"]) };
const rune = (id: string, code: string, inclinee = false) => ({ id, code, inclinee });

describe("paiement automatique", () => {
  it("énergie seule : incline le bon nombre de runes prêtes", () => {
    const p = calculerPaiement(carte("u", ["Fury"], 2), [rune("a", "fury", true), rune("b", "chaos"), rune("c", "fury")], CARTES);
    expect(p).toEqual({ ok: true, incliner: ["b", "c"], recycler: [] });
  });

  it("puissance : recycle d'abord une rune déjà inclinée du bon domaine", () => {
    const p = calculerPaiement(carte("s", ["Fury"], 2, 1), [rune("a", "fury", true), rune("b", "chaos"), rune("c", "chaos")], CARTES);
    expect(p).toEqual({ ok: true, incliner: ["b", "c"], recycler: ["a"] });
  });

  it("puissance avec une rune prête : elle est inclinée puis recyclée", () => {
    // Void Seeker : 3 énergie + 1 Fury, avec exactement 3 runes prêtes.
    const p = calculerPaiement(carte("v", ["Fury"], 3, 1), [rune("a", "chaos"), rune("b", "fury"), rune("c", "fury")], CARTES);
    expect(p).toEqual({ ok: true, incliner: ["b", "a", "c"], recycler: ["b"] });
  });

  it("refuse quand il manque des runes, avec une raison lisible", () => {
    expect(calculerPaiement(carte("u", ["Fury"], 4), [rune("a", "fury"), rune("b", "fury")], CARTES)).toEqual({ ok: false, raison: "Il faut 4 runes prêtes, tu en as 2." });
    expect(calculerPaiement(carte("u", ["Chaos"], 1, 1), [rune("a", "fury"), rune("b", "fury")], CARTES)).toEqual({ ok: false, raison: "Il faut 1 rune Chaos à recycler, tu en as 0." });
  });

  it("affiche le coût", () => {
    expect(libelleCout(carte("a", ["Chaos"], 4, 1))).toBe("4 énergie + 1 Chaos");
    expect(libelleCout(carte("b", ["Fury"], 0))).toBe("gratuite");
  });
});
