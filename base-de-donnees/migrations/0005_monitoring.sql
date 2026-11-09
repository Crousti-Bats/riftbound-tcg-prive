-- Migration 0005 : monitoring admin (étape 8).
-- Toutes les dates sont des horodatages en millisecondes (Date.now()).

-- Dernières cartes remarquables tirées (Epic et au-delà : Alt Art, Overnumbered, signée, Special, Ultime).
-- Comme partout : seulement un cardCode, jamais de donnée de carte.
CREATE TABLE tirages_remarquables (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  compte_id   INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  card_code   TEXT    NOT NULL,
  est_foil    INTEGER NOT NULL DEFAULT 0 CHECK (est_foil IN (0, 1)),
  horodatage  INTEGER NOT NULL
);
CREATE INDEX idx_tirages_remarquables_horodatage ON tirages_remarquables (horodatage);

-- Erreurs serveur (500) : méthode, chemin sans paramètres, message tronqué. Jamais le corps de la requête
-- ni les en-têtes (cookies). Purgées au bout de 7 jours.
CREATE TABLE erreurs_serveur (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  horodatage  INTEGER NOT NULL,
  methode     TEXT    NOT NULL,
  chemin      TEXT    NOT NULL,
  message     TEXT    NOT NULL
);
CREATE INDEX idx_erreurs_serveur_horodatage ON erreurs_serveur (horodatage);

-- Compteurs du tableau de bord (connexions échouées, échanges par période).
CREATE INDEX idx_journal_type_horodatage ON journal (type, horodatage);
CREATE INDEX idx_echanges_cree ON echanges (cree_le);
CREATE INDEX idx_echanges_termine ON echanges (termine_le);

UPDATE parametres SET valeur = '5', modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE cle = 'version_schema';
