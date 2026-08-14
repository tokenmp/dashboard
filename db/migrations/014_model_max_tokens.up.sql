-- models 增加模型级最大输出上限。
-- 语义：模型对外承诺的单次响应 token 上限；NULL/0 = 未声明，
-- /v1/models 回退取活跃映射的 MAX(upstream_model_mappings.max_tokens)。

ALTER TABLE models ADD COLUMN IF NOT EXISTS max_tokens INT;
COMMENT ON COLUMN models.max_tokens IS 'Model-level max output tokens. NULL/0 = unset, falls back to MAX(upstream_model_mappings.max_tokens) over active mappings.';
