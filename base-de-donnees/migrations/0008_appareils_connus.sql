-- Migration 0008 (étape 10) : appareils connus.
-- Après une connexion réussie, le navigateur reçoit un cookie « appareil » (jeton aléatoire, seule son empreinte
-- SHA-256 est stockée ici). Sur cet appareil, le blocage « 5 échecs sur ce pseudo » ne s'applique pas :
-- l'appareil a son propre compteur. Ainsi, un inconnu qui tape volontairement de mauvais mots de passe sur
-- un pseudo ne peut plus empêcher son propriétaire de se connecter depuis ses appareils habituels.
CREATE TABLE appareils_connus (
  jeton_hash      TEXT    PRIMARY KEY,
  compte_id       INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  cree_le         INTEGER NOT NULL,
  dernier_usage   INTEGER NOT NULL
);
CREATE INDEX idx_appareils_compte ON appareils_connus (compte_id);
CREATE INDEX idx_appareils_usage ON appareils_connus (dernier_usage);
