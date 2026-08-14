-- 回滚：删除套餐分类标签列（数据不保留）
ALTER TABLE plans DROP COLUMN IF EXISTS category;
