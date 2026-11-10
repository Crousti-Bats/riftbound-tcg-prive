-- Migration 0006 : réinitialisation de mot de passe par lien à usage unique (créé par l'admin).
-- Le site n'a pas d'e-mail : l'admin génère le lien et le transmet lui-même au joueur.
-- Seule l'empreinte SHA-256 du code est stockée, comme pour les invitations.
CREATE TABLE reinitialisations_mdp (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  compte_id    INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  code_hash    TEXT    NOT NULL UNIQUE,
  cree_par     INTEGER REFERENCES comptes(id) ON DELETE SET NULL,
  cree_le      INTEGER NOT NULL,
  expire_le    INTEGER NOT NULL,
  utilisee_le  INTEGER
);
CREATE INDEX idx_reinitialisations_compte ON reinitialisations_mdp (compte_id);

UPDATE parametres SET valeur = '6', modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE cle = 'version_schema';
