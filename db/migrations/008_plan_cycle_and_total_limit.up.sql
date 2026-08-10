-- 套餐计费模型扩展：拆分「计费周期」与「默认有效期」，新增「总限额」。
--
-- 背景：原 plans.default_duration_days 同时承担「计费周期」与「默认有效期」两个角色，
-- 无法表达「按天套餐（周期=1天）+ 30 天有效期」这类组合。本次新增两列将其解耦：
--   cycle_days   计费周期（monthly_limit 的刷新窗口长度）；NULL 时后端回退用 default_duration_days（向后兼容）
--   total_limit  生命周期总量上限（自激活起累计，永不刷新）
--
-- 兼容性：均为可空、无默认、无约束的加列；执行器对 plans 的 INSERT/SELECT 使用显式列名，
-- 不引用这两列，故对正在运行的执行器透明、无影响。
-- 部署顺序：先执行本迁移（安全、可随时做），再部署引用新列的 dashboard 代码。

ALTER TABLE plans ADD COLUMN IF NOT EXISTS cycle_days integer;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS total_limit integer;
