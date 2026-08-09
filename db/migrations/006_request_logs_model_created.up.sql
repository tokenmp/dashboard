-- 支持按模型名 + 时间范围聚合请求级成功率（panel 模型卡片近 24h 成功率）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_request_logs_model_created
  ON request_logs (model_name, created_at DESC);
