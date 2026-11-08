-- Migration 0001 : initialisation de la base.
-- Table de paramètres globaux de l'application (clé/valeur).
-- Les tables des comptes, collections, boosters et échanges arriveront aux étapes 3, 5 et 7.
CREATE TABLE IF NOT EXISTS parametres (
  cle         TEXT PRIMARY KEY,
  valeur      TEXT NOT NULL,
  modifie_le  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO parametres (cle, valeur) VALUES ('version_schema', '1');
