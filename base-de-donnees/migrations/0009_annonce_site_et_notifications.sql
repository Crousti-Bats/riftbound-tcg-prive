-- Migration 0009 : bandeau d'annonce de l'admin et notifications push « boosters pleins ».

-- Annonce affichée en grand bandeau à tous les joueurs connectés. Une seule à la fois : la plus récente non retirée.
CREATE TABLE annonce_site (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  texte       TEXT    NOT NULL CHECK (length(texte) BETWEEN 1 AND 300),
  cree_par    INTEGER REFERENCES comptes(id) ON DELETE SET NULL,
  cree_le     INTEGER NOT NULL,
  retiree_le  INTEGER
);

-- Abonnements Web Push (un par navigateur ou téléphone). Pas de donnée secrète : l'endpoint et les clés publiques
-- ne permettent que d'envoyer un message chiffré à ce navigateur, et le serveur n'appelle que les services de push connus.
CREATE TABLE abonnements_push (
  endpoint    TEXT    PRIMARY KEY CHECK (length(endpoint) <= 1000),
  compte_id   INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  p256dh      TEXT    NOT NULL,
  auth        TEXT    NOT NULL,
  cree_le     INTEGER NOT NULL
);
CREATE INDEX idx_abonnements_push_compte ON abonnements_push (compte_id);

-- Instant (calculé) où le stock a atteint 15 et pour lequel la notification a déjà été envoyée : une seule par remplissage.
ALTER TABLE comptes ADD COLUMN boosters_plein_notifie INTEGER;
