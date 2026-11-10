import { describe, expect, it } from "vitest";
import { categorieRevelation, numerosCarte, ordreRecapitulatif, ordreRevelation, themeCarte } from "./ouverture-revelation";
import type { CarteOuverte } from "./libelles-cartes";

type Mini = Pick<CarteOuverte, "slot" | "rarete" | "variante"> & { id: string };
const carte = (id: string, slot: Mini["slot"], rarete: string, variante = "base"): Mini => ({ id, slot, rarete, variante });

describe("catégorie de révélation", () => {
  it("la variante prime sur la rareté imprimée", () => {
    expect(categorieRevelation({ rarete: "Epic", variante: "ultime" })).toBe("ultime");
    expect(categorieRevelation({ rarete: "Rare", variante: "overnumbered" })).toBe("over");
    expect(categorieRevelation({ rarete: "Epic", variante: "alt" })).toBe("alt");
    expect(categorieRevelation({ rarete: "Rare", variante: "signee" })).toBe("signee");
    expect(categorieRevelation({ rarete: "Epic", variante: "special" })).toBe("special");
    expect(categorieRevelation({ rarete: "Common", variante: "rune_alt" })).toBe("rune");
  });

  it("une carte de base suit sa rareté, un token reste une commune", () => {
    expect(categorieRevelation({ rarete: "Common", variante: "base" })).toBe("common");
    expect(categorieRevelation({ rarete: "Uncommon", variante: "base" })).toBe("uncommon");
    expect(categorieRevelation({ rarete: "Rare", variante: "base" })).toBe("rare");
    expect(categorieRevelation({ rarete: "Epic", variante: "base" })).toBe("epic");
    expect(categorieRevelation({ rarete: "Common", variante: "token" })).toBe("common");
  });
});

describe("ordre de révélation", () => {
  it("garde la meilleure carte pour la fin, quel que soit l'ordre du serveur", () => {
    const booster = [
      carte("c1", "common", "Common"),
      carte("c2", "common", "Common"),
      carte("u1", "uncommon", "Uncommon"),
      carte("f", "foil", "Rare"),
      carte("ultime", "rarePlus", "Epic", "ultime"),
      carte("rare", "rarePlus", "Rare"),
      carte("rune", "runeToken", "Common", "rune"),
    ];
    expect(ordreRevelation(booster).map((c) => c.id)).toEqual(["c1", "c2", "u1", "f", "rune", "rare", "ultime"]);
  });
});

describe("ordre du récapitulatif", () => {
  it("met les plus rares en premier, la foil devant à rareté égale", () => {
    type Recap = Pick<CarteOuverte, "rarete" | "variante" | "foil"> & { id: string };
    const r = (id: string, rarete: string, variante = "base", foil = false): Recap => ({ id, rarete, variante, foil });
    const cartes = [
      r("c1", "Common"),
      r("c2", "Common"),
      r("u1", "Uncommon"),
      r("rune", "Common", "rune"),
      r("rareFoil", "Rare", "base", true),
      r("rare", "Rare"),
      r("epic", "Epic"),
      r("alt", "Showcase", "alt"),
    ];
    expect(ordreRecapitulatif(cartes).map((c) => c.id)).toEqual(["alt", "epic", "rareFoil", "rare", "u1", "rune", "c1", "c2"]);
  });
});

describe("thèmes et numéros", () => {
  it("reconnaît les cartes K/DA et Heartsteel", () => {
    expect(themeCarte("rad-sp3-005")).toBe("kda");
    expect(themeCarte("rad-181-167")).toBe("heartsteel");
    expect(themeCarte("ogn-001-298")).toBeNull();
  });

  it("lit le numéro et le total, y compris pour une signée", () => {
    expect(numerosCarte("unl-238-219")).toEqual({ numero: 238, total: 219 });
    expect(numerosCarte("sfd-236-star-221")).toEqual({ numero: 236, total: 221 });
    expect(numerosCarte("rad-sp1-005")).toEqual({ numero: 1, total: 5 });
  });
});
