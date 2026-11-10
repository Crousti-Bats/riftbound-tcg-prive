/** Le tutoriel se joue de bout en bout : chaque étape se valide avec « Montre-moi », et pas avant. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ActionTable, type EtatTable, type IndexJoueur, appliquerAction, idZone, vuePour } from "../../serveur-api/table/moteur-table";
import { ADVERSAIRE, C, ControleurTutoriel, ETAPES, MOI, carteDans, jouerPas, preparerTutoriel } from "./tutoriel";

function appliquer(etat: EtatTable, j: IndexJoueur) {
  return (action: ActionTable) => {
    const r = appliquerAction(etat, j, action, () => 0.5, 1000);
    expect(r, JSON.stringify(action)).toEqual({ ok: true });
  };
}

describe("tutoriel", () => {
  it("met en place toujours la même partie", () => {
    const etat = preparerTutoriel("Alice", 0);
    const codes = (zone: string) => (etat.zones[zone] ?? []).map((id) => etat.cartes[id]?.code);
    expect(etat.premier).toBe(MOI);
    expect(codes(idZone(MOI, "main"))).toEqual([C.rearguard, C.duo, C.voidSeeker, C.cleave]);
    expect(codes(idZone(MOI, "deck")).slice(0, 2)).toEqual([C.fallingStar, C.hopeful]);
    expect(codes(idZone(MOI, "deck"))).toHaveLength(35);
    expect(codes(idZone(MOI, "runes")).slice(0, 4)).toEqual([C.fury, C.chaos, C.fury, C.fury]);
    expect(codes(idZone(ADVERSAIRE, "main"))).toEqual([C.corsair, C.rookie, C.firstMate, C.sabotage]);
    expect(codes("champ.0")).toEqual([C.monastere]);
    expect(codes("champ.1")).toEqual([C.arbre]);
    expect(codes(idZone(MOI, "terrains"))).toHaveLength(2);
    // La main de l'adversaire reste cachée, comme en ligne.
    expect(vuePour(etat, MOI).zones[idZone(ADVERSAIRE, "main")]).toBe(4);
  });

  it("se joue de bout en bout, chaque étape validée par son aide et pas avant", () => {
    const etat = preparerTutoriel("Alice", 0);
    ETAPES.forEach((etape, i) => {
      const depart = structuredClone(etat);
      if (etape.adversaire) jouerPas(etat, etape.adversaire, appliquer(etat, ADVERSAIRE));
      if (etape.surBouton) jouerPas(etat, etape.surBouton, appliquer(etat, MOI));
      if (etape.reussie) {
        expect(etape.reussie(etat, depart), `étape ${i} déjà réussie : ${etape.titre}`).toBe(false);
        jouerPas(etat, etape.aide ?? [], appliquer(etat, MOI));
        expect(etape.reussie(etat, depart), `étape ${i} : ${etape.titre}`).toBe(true);
      }
    });
    expect(etat.joueurs[MOI].points).toBe(3);
    expect(carteDans(etat, "champ.0", C.rearguard)).toBeDefined();
    expect(carteDans(etat, "champ.1", C.duo)).toBeDefined();
    expect(carteDans(etat, idZone(MOI, "base"), C.annie)).toBeDefined();
    expect(carteDans(etat, idZone(MOI, "main"), C.voidSeeker)).toBeDefined();
    expect(carteDans(etat, idZone(ADVERSAIRE, "defausse"), C.corsair)).toBeDefined();
    expect((etat.zones[idZone(ADVERSAIRE, "base")] ?? []).length).toBe(2);
  });

  describe("contrôleur", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("joue tout le tuto avec les boutons, l'adversaire jouant tout seul", () => {
      vi.useFakeTimers();
      const tuto = new ControleurTutoriel("Alice");
      let notifications = 0;
      tuto.abonner(() => notifications++);
      for (let tour = 0; tour < 200 && !tuto.lire().libre; tour++) {
        const { etape, automatique, bravo } = tuto.lire();
        const courante = ETAPES[etape];
        if (!automatique && !bravo && courante && !courante.adversaire) {
          if (courante.reussie) tuto.montrer();
          else tuto.valider();
        }
        vi.advanceTimersByTime(1000);
      }
      expect(tuto.lire().libre).toBe(true);
      expect(tuto.lire().vue.joueurs[MOI].points).toBe(3);
      expect(notifications).toBeGreaterThan(50);
    });

    it("refuse un geste pendant le tour de l'adversaire, et recommence à zéro", () => {
      vi.useFakeTimers();
      const tuto = new ControleurTutoriel("Alice");
      tuto.valider();
      tuto.valider();
      jouerPas(tuto.lireEtat(), ETAPES[2]?.aide ?? [], tuto.envoyer);
      expect(tuto.lire().bravo).toBe(true);
      vi.advanceTimersByTime(1200);
      expect(tuto.lire().etape).toBe(3);
      // Étapes 3 à 5 jouées à la main, puis le tour de Garen commence.
      for (const n of [3, 4, 5]) {
        jouerPas(tuto.lireEtat(), ETAPES[n]?.aide ?? [], tuto.envoyer);
        vi.advanceTimersByTime(1200);
      }
      expect(ETAPES[tuto.lire().etape]?.adversaire).toBeDefined();
      vi.advanceTimersByTime(400);
      tuto.envoyer({ type: "piocher", n: 1 });
      expect(tuto.lire().erreur).toMatch(/Attends/);
      tuto.recommencer();
      expect(tuto.lire().etape).toBe(0);
      expect(tuto.lire().partie).toBe(1);
      expect(tuto.lire().vue.joueurs[MOI].points).toBe(0);
    });
  });
});
