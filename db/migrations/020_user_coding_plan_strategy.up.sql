-- 用户自定义扣费套餐选择策略（多 coding 套餐时的扣费顺序）。
--
-- 存储为逗号分隔的有序策略 key 列表，合法性由代码层枚举把关（Go/PHP 均有枚举），
-- 不用 PG 原生 ENUM：后续加策略值需改类型，演进成本高。
--
-- 默认 = soonest_expiry,smallest_limit,least_remaining,oldest_first
-- （最近到期 → 限额小 → 剩余少 → 先激活；即先榨干快到期/小/将满的套餐）。
-- 注意：这是对存量用户的行为切换——旧逻辑为「限额大优先、新绑定优先」。
ALTER TABLE users ADD COLUMN IF NOT EXISTS coding_plan_strategy TEXT NOT NULL DEFAULT 'soonest_expiry,smallest_limit,least_remaining,oldest_first';
