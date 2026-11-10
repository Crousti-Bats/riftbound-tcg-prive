-- Une carte obtenue quitte désormais la wishlist (échange accepté ou booster ouvert, demandé le 2026-11-10).
-- Ménage unique : on retire des wishlists les cartes que leur propriétaire possède déjà (normale ou foil).
DELETE FROM wishlist
WHERE EXISTS (
  SELECT 1 FROM collection
  WHERE collection.compte_id = wishlist.compte_id
    AND collection.card_code = wishlist.card_code
    AND collection.quantite > 0
);
