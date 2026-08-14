-- 回滚：删除短期窗口重置锚点列。
ALTER TABLE user_plans DROP COLUMN IF EXISTS windows_reset_at;
