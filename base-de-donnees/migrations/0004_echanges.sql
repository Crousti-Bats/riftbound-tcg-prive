-- Migration 0004 : échanges de cartes entre joueurs.
-- Toutes les dates sont des horodatages en millisecondes (Date.now()).
-- Aucune donnée de carte n'est stockée : seulement des cardCode et des quantités.

-- Une proposition d'échange : l'auteur propose au destinataire.
-- statut : en_attente → accepte | refuse | annule | expire | echoue (cartes plus disponibles au moment d'accepter).
CREATE TABLE echanges (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  auteur_id          INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  destinataire_id    INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  statut             TEXT    NOT NULL DEFAULT 'en_attente'
                     CHECK (statut IN ('en_attente', 'accepte', 'refuse', 'annule', 'expire', 'echoue')),
  message            TEXT    CHECK (message IS NULL OR length(message) <= 200),
  cree_le            INTEGER NOT NULL,
  expire_le          INTEGER NOT NULL,
  termine_le         INTEGER,
  -- Jeton aléatoire posé au moment de l'acceptation : les transferts de cartes du même lot ne s'exécutent
  -- que si CE jeton est en place (garantit qu'un échange n'est jamais exécuté deux fois).
  jeton_acceptation  TEXT,
  CHECK (auteur_id <> destinataire_id)
);
CREATE INDEX idx_echanges_destinataire ON echanges (destinataire_id, statut);
CREATE INDEX idx_echanges_auteur ON echanges (auteur_id, statut);

-- Cartes d'un échange. sens = 'donne' : de l'auteur vers le destinataire ; 'demande' : du destinataire vers l'auteur.
CREATE TABLE echanges_cartes (
  echange_id  INTEGER NOT NULL REFERENCES echanges(id) ON DELETE CASCADE,
  sens        TEXT    NOT NULL CHECK (sens IN ('donne', 'demande')),
  card_code   TEXT    NOT NULL,
  est_foil    INTEGER NOT NULL CHECK (est_foil IN (0, 1)),
  quantite    INTEGER NOT NULL CHECK (quantite > 0 AND quantite <= 99),
  PRIMARY KEY (echange_id, sens, card_code, est_foil)
);

UPDATE parametres SET valeur = '4', modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE cle = 'version_schema';
