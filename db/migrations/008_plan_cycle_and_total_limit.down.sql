-- 回滚：移除计费周期 / 总限额列（会丢失数据，仅用于回滚）。
-- 注意：回滚前确认没有 dashboard 代码再引用这两列。

ALTER TABLE plans DROP COLUMN IF EXISTS total_limit;
ALTER TABLE plans DROP COLUMN IF EXISTS cycle_days;
