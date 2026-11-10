-- Migration 0010 : personnalisation du profil (avatar, bio, vitrine).
-- Aucune donnée de carte n'est stockée : seulement des cardCode.

-- Avatar : illustration d'une carte que le joueur possédait au moment du choix (elle reste s'il l'échange ensuite).
-- Bio : texte brut, 200 caractères maximum (jamais interprété comme du HTML).
ALTER TABLE comptes ADD COLUMN avatar_card_code TEXT;
ALTER TABLE comptes ADD COLUMN bio TEXT CHECK (bio IS NULL OR length(bio) <= 200);

-- Vitrine : 6 cartes possédées, dans l'ordre choisi. Une carte qui n'est plus possédée n'est plus affichée
-- (filtrée à la lecture, comme les annonces « Qui veut ? »).
CREATE TABLE vitrine (
  compte_id  INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL CHECK (position >= 0 AND position < 6),
  card_code  TEXT    NOT NULL,
  est_foil   INTEGER NOT NULL DEFAULT 0 CHECK (est_foil IN (0, 1)),
  PRIMARY KEY (compte_id, position),
  UNIQUE (compte_id, card_code, est_foil)
);

UPDATE parametres SET valeur = '10', modifie_le = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE cle = 'version_schema';
