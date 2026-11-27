-- Migration 0021 : retrait du jeu de cartes (decks et table de jeu en ligne).
-- Les decks des joueurs et l'historique des parties sont supprimés définitivement.
-- Les salles de jeu (Durable Objects) sont supprimées par la migration « v2-retrait-salles » de cloudflare-wrangler.jsonc.
DROP INDEX IF EXISTS idx_parties_createur;
DROP INDEX IF EXISTS idx_parties_invite;
DROP TABLE IF EXISTS parties;
DROP INDEX IF EXISTS idx_decks_compte;
DROP TABLE IF EXISTS decks;
