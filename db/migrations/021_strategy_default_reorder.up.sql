-- 默认扣费策略顺序调整：最近到期 → 剩余少 → 限额小 → 先激活
-- （原顺序为 到期 → 限额 → 剩余 → 激活；用户审定稿）
--
-- 两件事：
-- 1. 列默认值更新（新用户 / 新写入走新顺序）；
-- 2. 存量行中仍等于旧默认串的用户（=从未自定义过）同步刷成新默认；
--    自定义过的行（值 ≠ 旧默认串）保持不动。
ALTER TABLE users ALTER COLUMN coding_plan_strategy SET DEFAULT 'soonest_expiry,least_remaining,smallest_limit,oldest_first';

UPDATE users
   SET coding_plan_strategy = 'soonest_expiry,least_remaining,smallest_limit,oldest_first'
 WHERE coding_plan_strategy = 'soonest_expiry,smallest_limit,least_remaining,oldest_first';
