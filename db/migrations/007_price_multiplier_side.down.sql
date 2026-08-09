ALTER TABLE price_multiplier_rules DROP CONSTRAINT IF EXISTS price_multiplier_rules_side_check;
ALTER TABLE price_multiplier_rules DROP COLUMN IF EXISTS side;
