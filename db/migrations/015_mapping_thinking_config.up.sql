-- upstream_model_mappings 增加映射级思考深度配置。
-- JSONB 结构（NULL = 未配置，沿用 executor 内置全局默认）:
--   {"supported_efforts": ["minimal","low","medium","high","xhigh","max"], "default_effort": "high"}
-- supported_efforts: 该上游实现接受的 reasoning effort 档位（大小写不敏感）；
-- default_effort: 用户未指定 effort（及非法值被拒后）的落点档位。

ALTER TABLE upstream_model_mappings ADD COLUMN IF NOT EXISTS thinking_config JSONB;
COMMENT ON COLUMN upstream_model_mappings.thinking_config IS 'Mapping-level thinking effort config: {"supported_efforts": [...], "default_effort": "..."}. NULL = executor built-in defaults.';
