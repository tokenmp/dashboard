-- notifications —— 用户站内通知（投递给具体用户、带可操作按钮、可去重）
-- dashboard 自有表，字段来自 app/model/Notification.php，幂等可重复执行。

CREATE TABLE IF NOT EXISTS notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL,
    type            VARCHAR(64)  NOT NULL DEFAULT '',
    title           VARCHAR(255) NOT NULL DEFAULT '',
    body            TEXT,
    severity        VARCHAR(32)  NOT NULL DEFAULT 'info',
    action_label    VARCHAR(128),
    action_url      VARCHAR(512),
    metadata        JSONB,
    read_at         TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    idempotency_key VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
    ON notifications (user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created
    ON notifications (user_id, type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency
    ON notifications (idempotency_key) WHERE idempotency_key IS NOT NULL;
