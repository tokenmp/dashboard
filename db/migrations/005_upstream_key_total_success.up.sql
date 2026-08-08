-- 上游 Key 累计成功调用次数（与 total_attempts 配对）
ALTER TABLE upstream_keys ADD COLUMN IF NOT EXISTS total_success_attempts bigint NOT NULL DEFAULT 0;

-- 改写触发器函数：同时维护 total_attempts 与 total_success_attempts（status_code 2xx 计成功）
CREATE OR REPLACE FUNCTION bump_upstream_key_attempts() RETURNS trigger AS $$
BEGIN
  IF NEW.upstream_key_id IS NOT NULL THEN
    UPDATE upstream_keys SET
      total_attempts = total_attempts + 1,
      total_success_attempts = total_success_attempts + (CASE WHEN NEW.status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END)
    WHERE id = NEW.upstream_key_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 回填历史成功数（status_code 2xx）
WITH agg AS (
  SELECT upstream_key_id AS kid, count(*) FILTER (WHERE status_code BETWEEN 200 AND 299) AS c
  FROM request_attempts
  WHERE upstream_key_id IS NOT NULL
  GROUP BY upstream_key_id
)
UPDATE upstream_keys uk SET total_success_attempts = COALESCE(agg.c, 0)
FROM agg WHERE agg.kid = uk.id;
