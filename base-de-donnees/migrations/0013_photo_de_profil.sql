-- Migration 0013 : photo de profil personnelle (demandée le 2026-11-10).
-- Image recadrée et réduite à 256 x 256 par le navigateur, vérifiée par le serveur (JPEG, PNG ou WebP, 150 Ko max),
-- stockée en base64. Aucune donnée de carte. Si elle existe, elle remplace l'avatar « carte ».
CREATE TABLE photos_profil (
  compte_id  INTEGER PRIMARY KEY REFERENCES comptes(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL CHECK (type IN ('image/jpeg', 'image/png', 'image/webp')),
  donnees    TEXT    NOT NULL CHECK (length(donnees) <= 204800),
  maj_le     INTEGER NOT NULL
);
-- Version de la photo (sert d'empreinte dans son adresse : une nouvelle photo = une nouvelle adresse, pas de vieux cache).
ALTER TABLE comptes ADD COLUMN avatar_photo_le INTEGER;
