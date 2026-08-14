-- 回滚：套餐限额字段改回历史名。
ALTER TABLE plans RENAME COLUMN cycle_limit TO monthly_limit;
ALTER TABLE plans RENAME COLUMN rolling_5h_limit TO hourly_5h_limit;
