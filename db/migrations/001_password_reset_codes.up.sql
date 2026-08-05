-- 密码重置验证码表（dashboard 自助重置密码功能）
--
-- 背景：Go executor 用进程内存验证码（一次性、5 分钟），但 PHP-FPM 多进程
-- 无法共享内存，故本功能将验证码落库（存 bcrypt(code)，不存明文）。
-- 部署时在业务库执行本脚本（幂等，可重复运行）。

CREATE TABLE IF NOT EXISTS password_reset_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pwreset_email_used_expires
    ON password_reset_codes (email, used, expires_at DESC);
