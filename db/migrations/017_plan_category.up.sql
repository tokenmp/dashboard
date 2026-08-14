-- 套餐分类标签（PR #32 套餐管理引入的遗留缺口：前后端均已使用 category，
-- 但从未配套建列 migration，首次在干净库上创建套餐即报 undefined column）
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS category VARCHAR(50);
