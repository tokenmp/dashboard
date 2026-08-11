-- user_release_reads —— 版本发布已读记录（更新日志的已读标记）
-- dashboard 自有表，字段来自 app/model/UserReleaseRead.php，幂等可重复执行。
-- 同一用户对同一发布至多一条（UNIQUE）。

CREATE TABLE IF NOT EXISTS user_release_reads (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL,
    release_id UUID        NOT NULL,
    read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uniq_user_release_read UNIQUE (user_id, release_id)
);

CREATE INDEX IF NOT EXISTS idx_user_release_reads_user
    ON user_release_reads (user_id);
