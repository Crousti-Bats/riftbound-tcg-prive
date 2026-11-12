-- Migration 0018 : éclats, la monnaie des doublons (demandé le 2026-11-12).
-- On recycle ses cartes en trop contre des éclats, puis on achète un booster ou on fabrique une carte.
-- Le CHECK (eclats >= 0) est la garde des lots D1 : un solde insuffisant ou un recyclage dont la collection a changé
-- fait échouer toute la transaction (voir serveur-api/eclats/routes-eclats.ts).
ALTER TABLE comptes ADD COLUMN eclats INTEGER NOT NULL DEFAULT 0 CHECK (eclats >= 0);
