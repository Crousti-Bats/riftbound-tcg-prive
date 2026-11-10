-- Migration 0016 : parties de la table de jeu (demandé le 2026-11-10).
-- Le salon (qui joue, avec quel deck, où en est la partie) est ici ; l'état de la table (cartes, zones, journal)
-- vit dans un Durable Object « SalleDeJeu » nommé d'après le code de la partie.
CREATE TABLE parties (
  code           TEXT    PRIMARY KEY CHECK (length(code) = 8),
  createur_id    INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  createur_deck  INTEGER NOT NULL,
  invite_id      INTEGER REFERENCES comptes(id) ON DELETE CASCADE,
  invite_deck    INTEGER,
  statut         TEXT    NOT NULL CHECK (statut IN ('attente', 'en_cours', 'terminee')),
  cree_le        INTEGER NOT NULL,
  maj_le         INTEGER NOT NULL
);
CREATE INDEX idx_parties_createur ON parties (createur_id, statut);
CREATE INDEX idx_parties_invite ON parties (invite_id, statut);
