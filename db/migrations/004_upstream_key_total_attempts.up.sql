-- 上游 Key 累计调用次数（避免对千万级 request_attempts 实时 count）
-- upstream_keys.total_attempts 由 request_attempts 的 AFTER INSERT 触发器维护
ALTER TABLE upstream_keys ADD COLUMN IF NOT EXISTS total_attempts bigint NOT NULL DEFAULT 0;

-- 触发器函数：每次 request_attempts 插入，对应 upstream_key 计数 +1
CREATE OR REPLACE FUNCTION bump_upstream_key_attempts() RETURNS trigger AS $$
BEGIN
  IF NEW.upstream_key_id IS NOT NULL THEN
    UPDATE upstream_keys SET total_attempts = total_attempts + 1 WHERE id = NEW.upstream_key_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_request_attempts_bump_key ON request_attempts;
CREATE TRIGGER trg_request_attempts_bump_key
AFTER INSERT ON request_attempts
FOR EACH ROW EXECUTE FUNCTION bump_upstream_key_attempts();

-- 回填历史累计（一次性全表 group by，设绝对值覆盖）
WITH agg AS (
  SELECT upstream_key_id AS kid, count(*) AS c
  FROM request_attempts
  WHERE upstream_key_id IS NOT NULL
  GROUP BY upstream_key_id
)
UPDATE upstream_keys uk SET total_attempts = COALESCE(agg.c, 0)
FROM agg WHERE agg.kid = uk.id;
