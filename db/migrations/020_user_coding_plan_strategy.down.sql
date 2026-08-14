-- 回滚：删除用户扣费套餐策略列。
ALTER TABLE users DROP COLUMN IF EXISTS coding_plan_strategy;
