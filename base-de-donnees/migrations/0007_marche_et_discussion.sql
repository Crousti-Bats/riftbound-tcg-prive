-- Migration 0007 : marché (annonces « Qui a ? / Qui veut ? ») et discussion (salon commun + messages privés).
-- Toutes les dates sont des horodatages en millisecondes (Date.now()).
-- Aucune donnée de carte n'est stockée : seulement des cardCode.

-- Annonce du marché. type = 'cherche' (« Qui a ? ») ou 'propose' (« Qui veut ? »).
-- Reste affichée jusqu'à ce que son auteur la retire (ou un admin), ou jusqu'à expire_le (30 jours).
CREATE TABLE annonces (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  compte_id   INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL CHECK (type IN ('cherche', 'propose')),
  card_code   TEXT    NOT NULL,
  est_foil    INTEGER NOT NULL DEFAULT 0 CHECK (est_foil IN (0, 1)),
  note        TEXT    CHECK (note IS NULL OR length(note) <= 140),
  cree_le     INTEGER NOT NULL,
  expire_le   INTEGER NOT NULL,
  retiree_le  INTEGER
);
CREATE INDEX idx_annonces_actives ON annonces (retiree_le, expire_le);
CREATE INDEX idx_annonces_compte ON annonces (compte_id);

-- Messages. conversation = 'salon' (salon commun du marché) ou 'p:<id le plus petit>:<id le plus grand>' (privé).
-- destinataire_id : NULL dans le salon. annonce_id : message publié avec une annonce (la carte s'affiche à côté).
CREATE TABLE messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation     TEXT    NOT NULL,
  expediteur_id    INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  destinataire_id  INTEGER REFERENCES comptes(id) ON DELETE CASCADE,
  texte            TEXT    NOT NULL CHECK (length(texte) <= 500),
  annonce_id       INTEGER REFERENCES annonces(id) ON DELETE SET NULL,
  cree_le          INTEGER NOT NULL,
  supprime_le      INTEGER
);
CREATE INDEX idx_messages_conversation ON messages (conversation, id);
CREATE INDEX idx_messages_destinataire ON messages (destinataire_id, id);
CREATE INDEX idx_messages_expediteur ON messages (expediteur_id, id);

-- Dernier message lu par compte et par conversation (pastilles « non lus »).
CREATE TABLE lectures (
  compte_id     INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  conversation  TEXT    NOT NULL,
  dernier_lu    INTEGER NOT NULL,
  PRIMARY KEY (compte_id, conversation)
);

UPDATE parametres SET valeur = '7', modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE cle = 'version_schema';
