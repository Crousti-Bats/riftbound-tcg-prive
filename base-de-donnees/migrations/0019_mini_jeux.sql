-- Migration 0019 : mini-jeux (demandé le 2026-11-13) : « Devine le champion » (4 modes) et Memory.
-- Comme partout : aucune donnée de carte, seulement des cardCode (et des identifiants de champions LoL). Les gains en éclats sont crédités dans le même lot D1
-- que la partie, et une seule fois (colonnes gain_credite).

-- Défi du jour : tiré au hasard côté serveur (crypto.getRandomValues) à la première visite du jour, puis figé.
-- jour = date à Paris (AAAA-MM-JJ). reponse = identifiant Data Dragon du champion LoL (« classique », « emoji ») ou
-- cardCode de la carte Riftbound montrée (« capacite », « illustration »).
CREATE TABLE defis_du_jour (
  jour    TEXT NOT NULL,
  mode    TEXT NOT NULL CHECK (mode IN ('classique', 'emoji', 'capacite', 'illustration')),
  reponse TEXT NOT NULL,
  PRIMARY KEY (jour, mode)
);

-- Essais d'un joueur pour le défi du jour. essais = tableau JSON des champions proposés (identifiants Data Dragon).
CREATE TABLE devinettes (
  compte_id    INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  jour         TEXT    NOT NULL,
  mode         TEXT    NOT NULL CHECK (mode IN ('classique', 'emoji', 'capacite', 'illustration')),
  essais       TEXT    NOT NULL DEFAULT '[]',
  nb_essais    INTEGER NOT NULL DEFAULT 0,
  trouve       INTEGER NOT NULL DEFAULT 0,
  gain         INTEGER NOT NULL DEFAULT 0,
  gain_credite INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (compte_id, jour, mode)
);
CREATE INDEX idx_devinettes_jour ON devinettes (jour, mode, trouve);

-- Parties de Memory : la grille (16 cardCode, 8 paires) reste sur le serveur ; le joueur ne découvre une carte
-- qu'en la retournant. trouvees = tableau JSON des positions déjà appariées ; retournee = 1re carte du coup en cours.
CREATE TABLE parties_memory (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  compte_id    INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  jour         TEXT    NOT NULL,
  grille       TEXT    NOT NULL,
  trouvees     TEXT    NOT NULL DEFAULT '[]',
  retournee    INTEGER,
  coups        INTEGER NOT NULL DEFAULT 0,
  terminee     INTEGER NOT NULL DEFAULT 0,
  gain         INTEGER NOT NULL DEFAULT 0,
  gain_credite INTEGER NOT NULL DEFAULT 0,
  cree_le      INTEGER NOT NULL
);
CREATE INDEX idx_parties_memory_compte ON parties_memory (compte_id, jour);
CREATE INDEX idx_parties_memory_cree ON parties_memory (cree_le);
