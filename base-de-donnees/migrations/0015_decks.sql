-- Migration 0015 : decks des joueurs (demandé le 2026-11-10).
-- contenu : JSON { legende, champion, principal: [{code, n}], runes: [{code, n}], terrains: [code] }.
-- Seulement des cardCode et des quantités, jamais de donnée de carte. Validé par le serveur à l'écriture
-- (structure) et à la lecture (règles du jeu et possession : la collection peut changer après un échange).
CREATE TABLE decks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  compte_id   INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  nom         TEXT    NOT NULL CHECK (length(nom) BETWEEN 1 AND 40),
  contenu     TEXT    NOT NULL CHECK (length(contenu) <= 8000),
  cree_le     INTEGER NOT NULL,
  modifie_le  INTEGER NOT NULL
);
CREATE INDEX idx_decks_compte ON decks (compte_id, modifie_le);
