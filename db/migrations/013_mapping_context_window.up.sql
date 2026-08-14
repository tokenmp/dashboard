-- upstream_model_mappings 增加映射级上下文窗口。
-- 语义：该映射（上游实现）能承载的上下文窗口；NULL 表示未声明，沿用模型级 models.context_window_tokens。
-- 注意：目前仅支持配置与展示，路由选择逻辑（按用户请求 max_tokens 过滤映射）后续实现。

ALTER TABLE upstream_model_mappings ADD COLUMN IF NOT EXISTS context_window_tokens INT;
COMMENT ON COLUMN upstream_model_mappings.context_window_tokens IS 'Mapping-level context window in tokens. NULL = unset, falls back to models.context_window_tokens.';
