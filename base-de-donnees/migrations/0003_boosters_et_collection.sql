-- Migration 0003 : moteur de boosters et collection des joueurs.
-- Toutes les dates sont des horodatages en millisecondes (Date.now()).
-- Aucune donnée de carte n'est stockée : seulement des cardCode et des quantités.

-- Stock de boosters, modèle paresseux (recalcul à la lecture, sans tâche planifiée).
-- stock_boosters : stock sauvegardé ; boosters_tick : instant de référence de la régénération (+1 / 10 min, max 15).
ALTER TABLE comptes ADD COLUMN stock_boosters INTEGER NOT NULL DEFAULT 15 CHECK (stock_boosters >= 0 AND stock_boosters <= 15);
ALTER TABLE comptes ADD COLUMN boosters_tick   INTEGER NOT NULL DEFAULT 0;

-- Collection : une ligne par (compte, carte, foil). Les cartes foil sont comptées séparément des normales.
CREATE TABLE collection (
  compte_id   INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  card_code   TEXT    NOT NULL,
  est_foil    INTEGER NOT NULL DEFAULT 0 CHECK (est_foil IN (0, 1)),
  quantite    INTEGER NOT NULL DEFAULT 0 CHECK (quantite >= 0),
  PRIMARY KEY (compte_id, card_code, est_foil)
);
CREATE INDEX idx_collection_compte ON collection (compte_id);

-- Journal des ouvertures de boosters (gameplay). Servira au monitoring de l'étape 8.
-- Distinct de la table `journal` (réservée aux événements de sécurité et d'admin).
CREATE TABLE ouvertures_boosters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  compte_id   INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  set_code    TEXT    NOT NULL,
  horodatage  INTEGER NOT NULL
);
CREATE INDEX idx_ouvertures_horodatage ON ouvertures_boosters (horodatage);
CREATE INDEX idx_ouvertures_compte ON ouvertures_boosters (compte_id);

-- Comptes déjà existants (l'admin Crousti) : stock plein, minuteur démarré maintenant.
UPDATE comptes SET stock_boosters = 15, boosters_tick = CAST(strftime('%s', 'now') AS INTEGER) * 1000;

UPDATE parametres SET valeur = '3', modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE cle = 'version_schema';
