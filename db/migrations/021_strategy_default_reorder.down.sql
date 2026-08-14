-- 回滚：默认扣费策略顺序还原为 到期 → 限额 → 剩余 → 激活。
ALTER TABLE users ALTER COLUMN coding_plan_strategy SET DEFAULT 'soonest_expiry,smallest_limit,least_remaining,oldest_first';

UPDATE users
   SET coding_plan_strategy = 'soonest_expiry,smallest_limit,least_remaining,oldest_first'
 WHERE coding_plan_strategy = 'soonest_expiry,least_remaining,smallest_limit,oldest_first';
