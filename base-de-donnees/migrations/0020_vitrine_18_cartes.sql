-- Migration 0020 : la vitrine du profil passe de 6 à 18 cartes, soit 3 lignes.
-- SQLite ne sait pas modifier une contrainte CHECK : on recrée la table et on recopie les vitrines existantes.
-- Toujours aucune donnée de carte : seulement des cardCode.
CREATE TABLE vitrine_nouvelle (
  compte_id  INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL CHECK (position >= 0 AND position < 18),
  card_code  TEXT    NOT NULL,
  est_foil   INTEGER NOT NULL DEFAULT 0 CHECK (est_foil IN (0, 1)),
  PRIMARY KEY (compte_id, position),
  UNIQUE (compte_id, card_code, est_foil)
);
INSERT INTO vitrine_nouvelle (compte_id, position, card_code, est_foil) SELECT compte_id, position, card_code, est_foil FROM vitrine;
DROP TABLE vitrine;
ALTER TABLE vitrine_nouvelle RENAME TO vitrine;
