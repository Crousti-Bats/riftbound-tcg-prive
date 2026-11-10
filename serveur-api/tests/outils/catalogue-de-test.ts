/**
 * Catalogue synthétique pour les tests du moteur de boosters.
 * Il garantit que tous les pools de tirage sont non vides et couvre les cas particuliers :
 *  - ogn : runes (variante base, type Rune) + rune alt, pas de token ;
 *  - sfd/unl/ven : tokens, pas de rune ; unl a en plus un Ultime ;
 *  - rad : ni rune ni token (teste le repli sur les runes d'Origins) ;
 *  - ven : ni Special ni Ultime (teste le report de leur probabilité sur les Rares) ;
 *  - une Légende (Rare) et un Terrain (Uncommon) pour vérifier leur présence dans les pools.
 */
import type { CarteCatalogue as Carte, Catalogue, Rarete, SetCatalogue, Variante } from "../../catalogue/types-catalogue";

let compteurChargeLe = 1;

function carte(partiel: Partial<Carte> & Pick<Carte, "code" | "set" | "rarete" | "variante">): Carte {
  return {
    nom: partiel.code,
    sousTitre: null,
    numero: "001-100",
    type: "Unit",
    etiquettes: [],
    tags: [],
    domaines: [],
    image: "https://cmsassets.rgpub.io/x-500x700.png",
    orientation: "portrait",
    energie: null,
    puissance: null,
    force: null,
    texte: null,
    artiste: null,
    ...partiel,
  };
}

interface OptionsSet {
  rune?: boolean;
  token?: boolean;
  special?: boolean;
  ultime?: boolean;
}

function cartesDUnSet(set: string, o: OptionsSet): Carte[] {
  const liste: Carte[] = [];
  const ajouter = (suffixe: string, rarete: Rarete, variante: Variante, extra: Partial<Carte> = {}) =>
    liste.push(carte({ code: `${set}-${suffixe}`, set, rarete, variante, ...extra }));

  for (let i = 0; i < 10; i++) ajouter(`c${i}`, "Common", "base");
  for (let i = 0; i < 4; i++) ajouter(`u${i}`, "Uncommon", "base");
  ajouter("bf", "Uncommon", "base", { type: "Battlefield", orientation: "paysage" }); // Terrain
  for (let i = 0; i < 4; i++) ajouter(`r${i}`, "Rare", "base");
  ajouter("leg", "Rare", "base", { type: "Legend" }); // Légende
  for (let i = 0; i < 3; i++) ajouter(`e${i}`, "Epic", "base");
  ajouter("alt0", "Showcase", "alt");
  ajouter("alt1", "Showcase", "alt");
  ajouter("over0", "Showcase", "overnumbered");
  ajouter("sig0", "Showcase", "signee");
  if (o.special) ajouter("sp0", "Showcase", "special");
  if (o.ultime) ajouter("ult0", "Epic", "ultime");
  if (o.rune) {
    ajouter("rune0", "Common", "base", { type: "Rune" });
    ajouter("rune1", "Common", "base", { type: "Rune" });
    ajouter("runea0", "Common", "rune_alt", { type: "Rune" });
  }
  if (o.token) {
    ajouter("tok0", "Common", "token", { type: "Token" });
    ajouter("tok1", "Common", "token", { type: "Token" });
  }
  return liste;
}

export function catalogueDeTest(): Catalogue {
  const parSet: Array<[string, boolean, OptionsSet]> = [
    ["ogn", true, { rune: true, special: true }],
    ["ogs", false, { token: true }],
    ["sfd", true, { token: true, special: true }],
    ["unl", true, { token: true, special: true, ultime: true }],
    ["ven", true, { token: true }], // ni special ni ultime
    ["rad", true, { special: true }], // ni rune ni token → repli Origins
  ];

  const cartes: Carte[] = [];
  const sets: SetCatalogue[] = [];
  for (const [code, ouvrable, options] of parSet) {
    const duSet = cartesDUnSet(code, options);
    cartes.push(...duSet);
    const parVariante: SetCatalogue["parVariante"] = {};
    const parRarete: SetCatalogue["parRarete"] = {};
    for (const c of duSet) {
      parVariante[c.variante] = (parVariante[c.variante] ?? 0) + 1;
      parRarete[c.rarete] = (parRarete[c.rarete] ?? 0) + 1;
    }
    sets.push({ code, nom: code.toUpperCase(), ouvrable, nbCartes: duSet.length, parVariante, parRarete });
  }

  return { cartes, sets, miseAJourSource: null, chargeLe: Date.now() + compteurChargeLe++, cartesIgnorees: 0 };
}
