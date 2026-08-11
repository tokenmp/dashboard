-- version_releases —— 版本发布说明（产品更新日志／Changelog）
-- dashboard 自有表，字段来自 app/model/VersionRelease.php，幂等可重复执行。

CREATE TABLE IF NOT EXISTS version_releases (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version      VARCHAR(64)  NOT NULL,
    title        VARCHAR(255) NOT NULL DEFAULT '',
    summary      TEXT,
    body         TEXT         NOT NULL DEFAULT '',
    release_type VARCHAR(32)  NOT NULL DEFAULT 'feature', -- feature / improvement / fix / security / perf
    released_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    status       VARCHAR(32)  NOT NULL DEFAULT 'draft',   -- draft / published / archived
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    created_by   VARCHAR(64),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_version_releases_version
    ON version_releases (version);
CREATE INDEX IF NOT EXISTS idx_version_releases_status_released
    ON version_releases (status, released_at DESC);
