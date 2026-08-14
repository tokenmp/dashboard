-- 供应商级与模型级思考深度配置（映射级 thinking_config 已由 015 添加）。
-- 继承链（整体覆盖式）：映射 → 模型 → 供应商 → executor 内置默认。

ALTER TABLE providers ADD COLUMN IF NOT EXISTS thinking_config JSONB;
COMMENT ON COLUMN providers.thinking_config IS 'Provider-level thinking effort config: {"supported_efforts": [...], "default_effort": "..."}. Inherited by models/mappings when unset.';

ALTER TABLE models ADD COLUMN IF NOT EXISTS thinking_config JSONB;
COMMENT ON COLUMN models.thinking_config IS 'Model-level thinking effort config: {"supported_efforts": [...], "default_effort": "..."}. Inherited by mappings when unset; itself inherits provider config when unset.';
