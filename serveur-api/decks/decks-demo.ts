/**
 * Decks de démo PRÊTÉS à tous les joueurs (demandé le 2026-11-10) pour tester la table de jeu en production :
 * jouables sans posséder les cartes, non modifiables, visibles par tout le monde (aucune ligne en base).
 * Construits avec les vraies cartes autour de deux champions du produit d'initiation (Proving Grounds), avec une
 * courbe de coûts équilibrée : ce ne sont pas les listes officielles. Pour les retirer : vider DECKS_DEMO.
 * Validés contre le vrai catalogue (règles de construction) avant d'être ajoutés. Aucun champ de bataille interdit en
 * tournoi (liste du 2026-10-09 : The Arena's Greatest, Aspirant's Climb, Dreaming Tree, Obelisk of Power, Reaver's Row).
 */
import type { ContenuDeck } from "./regles-deck";

export interface DeckDemo {
  /** Identifiant négatif : ne se confond jamais avec un deck en base. */
  id: number;
  nom: string;
  contenu: ContenuDeck;
}

export const DECKS_DEMO: readonly DeckDemo[] = [
  {
    id: -1,
    nom: "Démo · Annie (Fury + Chaos)",
    contenu: {
      legende: "ogs-017-024", // Dark Child, Starter
      champion: "ogs-010-024", // Annie, Stubborn
      principal: [
        { code: "ogs-010-024", n: 2 }, // Annie, Stubborn
        { code: "ogs-001-024", n: 2 }, // Annie, Fiery
        { code: "ogs-018-024", n: 3 }, // Tibbers, Annie
        { code: "ogn-199-298", n: 3 }, // Tideturner
        { code: "ogn-003-298", n: 3 }, // Chemtech Enforcer
        { code: "ogn-006-298", n: 3 }, // Flame Chompers
        { code: "ogn-016-298", n: 3 }, // Dangerous Duo
        { code: "ogn-012-298", n: 3 }, // Noxus Hopeful
        { code: "ogn-191-298", n: 3 }, // Maddened Marauder
        { code: "ogn-004-298", n: 3 }, // Cleave
        { code: "ogn-029-298", n: 3 }, // Falling Star
        { code: "ogn-024-298", n: 3 }, // Void Seeker
        { code: "ogn-021-298", n: 3 }, // Sun Disc
        { code: "ogn-010-298", n: 2 }, // Legion Rearguard
      ],
      runes: [
        { code: "ogn-007-298", n: 6 }, // Fury Rune
        { code: "ogn-166-298", n: 6 }, // Chaos Rune
      ],
      terrains: ["ogn-275-298", "ogn-282-298", "ogn-294-298"], // Altar to Unity, Monastery of Hirana, Trifarian War Camp
    },
  },
  {
    id: -2,
    nom: "Démo · Garen (Body + Order)",
    contenu: {
      legende: "ogs-023-024", // Might of Demacia, Starter
      champion: "ogs-013-024", // Garen, Commander
      principal: [
        { code: "ogs-013-024", n: 2 }, // Garen, Commander
        { code: "ogs-007-024", n: 2 }, // Garen, Rugged
        { code: "ogs-024-024", n: 3 }, // Decisive Strike, Garen
        { code: "ogn-136-298", n: 3 }, // Pit Rookie
        { code: "ogn-139-298", n: 3 }, // Cithria of Cloudfield
        { code: "ogn-150-298", n: 3 }, // Kraken Hunter
        { code: "ogn-130-298", n: 3 }, // Crackshot Corsair
        { code: "ogn-230-298", n: 3 }, // Albus Ferros
        { code: "ogn-149-298", n: 3 }, // Carnivorous Snapvine
        { code: "ogn-156-298", n: 3 }, // Sabotage
        { code: "ogn-127-298", n: 3 }, // Cannon Barrage
        { code: "ogn-206-298", n: 3 }, // Back to Back
        { code: "ogn-212-298", n: 3 }, // Forge of the Future
        { code: "ogn-132-298", n: 2 }, // First Mate
      ],
      runes: [
        { code: "ogn-126-298", n: 6 }, // Body Rune
        { code: "ogn-214-298", n: 6 }, // Order Rune
      ],
      terrains: ["ogn-278-298", "ogn-279-298", "ogn-295-298"], // Bandle Tree, Fortified Position, Vilemaw's Lair
    },
  },
];

export const deckDemo = (id: number): DeckDemo | undefined => DECKS_DEMO.find((d) => d.id === id);
