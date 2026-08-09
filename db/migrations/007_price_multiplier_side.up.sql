-- 价格倍率规则区分上游侧（upstream 成本）与用户侧（user 扣费）
ALTER TABLE price_multiplier_rules
  ADD COLUMN IF NOT EXISTS side VARCHAR(16) NOT NULL DEFAULT 'user';

ALTER TABLE price_multiplier_rules DROP CONSTRAINT IF EXISTS price_multiplier_rules_side_check;
ALTER TABLE price_multiplier_rules
  ADD CONSTRAINT price_multiplier_rules_side_check CHECK (side IN ('upstream', 'user'));

-- 清理旧的测试数据（全局 scope，未接入实际计费，保留会污染模拟报表）
DELETE FROM price_multiplier_rules
  WHERE provider_id IS NULL AND upstream_key_id IS NULL AND model_id IS NULL;
