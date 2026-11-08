-- Migration 0002 : comptes, sessions, invitations, limitation des tentatives, journal.
-- Toutes les dates sont des horodatages en millisecondes (Date.now()).

-- Comptes joueurs. Le rôle 'admin' ne peut être obtenu que via une invitation admin créée en ligne de commande.
CREATE TABLE comptes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo              TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  hash_mot_de_passe   TEXT    NOT NULL,            -- format : pbkdf2-sha256$iterations$sel$hash
  role                TEXT    NOT NULL DEFAULT 'joueur' CHECK (role IN ('joueur', 'admin')),
  actif               INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
  cree_le             INTEGER NOT NULL,
  derniere_activite   INTEGER
);

-- Sessions de connexion. On stocke uniquement l'empreinte SHA-256 du jeton : une fuite de la base ne permet pas de se connecter.
CREATE TABLE sessions (
  id_hash             TEXT    PRIMARY KEY,
  compte_id           INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  cree_le             INTEGER NOT NULL,
  expire_le           INTEGER NOT NULL,
  derniere_activite   INTEGER NOT NULL,
  admin_jusqua        INTEGER NOT NULL DEFAULT 0,  -- accès admin ouvert jusqu'à cet instant (après re-saisie du mot de passe)
  ip                  TEXT,
  agent               TEXT
);
CREATE INDEX idx_sessions_compte ON sessions (compte_id);
CREATE INDEX idx_sessions_expire ON sessions (expire_le);

-- Invitations. Le code n'est jamais stocké en clair : seulement son empreinte SHA-256.
CREATE TABLE invitations (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash           TEXT    NOT NULL UNIQUE,
  role                TEXT    NOT NULL DEFAULT 'joueur' CHECK (role IN ('joueur', 'admin')),
  pseudo_reserve      TEXT    COLLATE NOCASE,      -- si renseigné, seul ce pseudo peut utiliser l'invitation
  note                TEXT,
  cree_par            INTEGER REFERENCES comptes(id) ON DELETE SET NULL,
  cree_le             INTEGER NOT NULL,
  expire_le           INTEGER NOT NULL,
  utilisee_par        INTEGER REFERENCES comptes(id) ON DELETE SET NULL,
  utilisee_le         INTEGER,
  revoquee            INTEGER NOT NULL DEFAULT 0 CHECK (revoquee IN (0, 1))
);

-- Compteurs de tentatives (connexion, inscription, élévation admin) par IP ou par pseudo.
CREATE TABLE limitations (
  cle                 TEXT    PRIMARY KEY,         -- ex. 'connexion:ip:1.2.3.4' ou 'connexion:pseudo:crousti'
  nombre              INTEGER NOT NULL,
  debut_fenetre       INTEGER NOT NULL
);

-- Journal des événements de sécurité et des actions admin (servira au monitoring de l'étape 8).
CREATE TABLE journal (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  horodatage          INTEGER NOT NULL,
  categorie           TEXT    NOT NULL CHECK (categorie IN ('securite', 'admin')),
  type                TEXT    NOT NULL,
  compte_id           INTEGER REFERENCES comptes(id) ON DELETE SET NULL,
  pseudo              TEXT,
  ip                  TEXT,
  details             TEXT
);
CREATE INDEX idx_journal_horodatage ON journal (horodatage);

UPDATE parametres SET valeur = '2', modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE cle = 'version_schema';
