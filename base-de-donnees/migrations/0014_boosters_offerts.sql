-- Migration 0014 : boosters offerts (2026-11-10).
-- boosters_bonus : boosters donnés en cadeau, EN PLUS du stock normal (qui reste plafonné à 10 et se régénère).
-- Ils ne se régénèrent pas et ne sont pas plafonnés. On ouvre d'abord le stock normal (le minuteur repart
-- donc tout de suite), puis les boosters offerts.
ALTER TABLE comptes ADD COLUMN boosters_bonus INTEGER NOT NULL DEFAULT 0 CHECK (boosters_bonus >= 0);

-- Cadeau unique : 10 boosters offerts à chaque compte existant. Une migration ne s'applique qu'une fois.
UPDATE comptes SET boosters_bonus = 10;
