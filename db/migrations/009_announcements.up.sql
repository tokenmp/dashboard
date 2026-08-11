-- announcements —— 站内公告（管理端发布、面向全站或指定范围展示的横幅通知）
-- dashboard 自有表，字段来自 app/model/Announcement.php，幂等可重复执行。

CREATE TABLE IF NOT EXISTS announcements (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title         VARCHAR(255) NOT NULL,
    body          TEXT         NOT NULL DEFAULT '',
    severity      VARCHAR(32)  NOT NULL DEFAULT 'info',   -- info / warning / urgent
    scope         VARCHAR(64)  NOT NULL DEFAULT 'all',
    dismissible   BOOLEAN      NOT NULL DEFAULT true,
    status        VARCHAR(32)  NOT NULL DEFAULT 'draft',  -- draft / published / archived
    sort_order    INTEGER      NOT NULL DEFAULT 0,
    publish_from  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    publish_until TIMESTAMPTZ,
    created_by    VARCHAR(64),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_status_created
    ON announcements (status, created_at DESC);
