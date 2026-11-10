-- Migration 0011 : stock de boosters ramené à 10 au maximum, +1 toutes les 20 minutes (avant : 15 et 10 minutes).
-- Chaque compte reçoit son stock réel calculé avec l'ANCIENNE règle (min(15, stock + minutes écoulées / 10)),
-- plafonné à 10, et le minuteur repart de maintenant (au plus 10 minutes de progression perdues).
-- La notification « boosters pleins » est remise à zéro : l'ancien instant mémorisé ne correspond plus au calcul.
UPDATE comptes SET
  stock_boosters = MIN(10, MIN(15, stock_boosters + MAX(0, (CAST(strftime('%s', 'now') AS INTEGER) * 1000 - boosters_tick) / 600000))),
  boosters_tick = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  boosters_plein_notifie = NULL;
