-- 套餐短期窗口重置锚点（方案 A：重置 5h/周，不影响周期/总量）。
--
-- 背景：执行器四维用量（5h/周/周期/总量）共用 created_at >= activated_at 下界，
-- 无法单独重置短期窗。新增可空列 windows_reset_at 后，仅 5h/周两维的下界变为
-- GREATEST(activated_at, COALESCE(windows_reset_at, activated_at))；
-- 周期窗与总量仍只认 activated_at。
-- 管理动作「重置5h/周窗口」= UPDATE 该列为 NOW()：5h/周即刻清空，
-- 周期与总量累计纹丝不动。
ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS windows_reset_at TIMESTAMPTZ;
