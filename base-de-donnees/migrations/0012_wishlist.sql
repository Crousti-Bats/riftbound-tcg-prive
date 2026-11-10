-- Migration 0012 : wishlist (cartes recherchées). Elles s'affichent dans « Qui a ? » au marché tant que
-- le joueur ne les possède pas (filtrées à la lecture). Seulement des cardCode.
CREATE TABLE wishlist (
  compte_id   INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  card_code   TEXT    NOT NULL,
  ajoutee_le  INTEGER NOT NULL,
  PRIMARY KEY (compte_id, card_code)
);
CREATE INDEX idx_wishlist_carte ON wishlist (card_code);
