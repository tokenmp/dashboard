/**
 * CC Switch 一键导入支持。
 *
 * CC Switch 是一个本地客户端，支持通过 ccswitch:// deeplink 一键导入 provider 配置。
 * 协议参考：ccswitch://v1/import?resource=provider&...
 *
 * 移植自 v3 前端 (web/src/lib/ccswitch.ts)，dashboard 密钥创建后弹窗复用。
 */

/** TokenMP Anthropic 协议默认 base URL（不带 /v1） */
export const TOKENMP_ANTHROPIC_BASE_URL = 'https://api.tokenmp.cn';
/** TokenMP OpenAI 兼容协议默认 base URL（带 /v1） */
export const TOKENMP_OPENAI_BASE_URL = 'https://api.tokenmp.cn/v1';
/** 默认模型名称 */
export const DEFAULT_MODEL = 'glm-5';

/** 支持导入的目标工具 */
export type CCSwitchApp = 'claude' | 'codex' | 'opencode' | 'openclaw';

export interface ToolImportTarget {
  app: CCSwitchApp;
  label: string;
  configFormat?: 'json' | 'toml';
  buildConfig?: (input: { model?: string; openAIBaseUrl?: string }) => string;
}

/** 可导入的工具列表 */
export const TOOL_IMPORT_TARGETS: ToolImportTarget[] = [
  { app: 'claude', label: 'Claude Code' },
  {
    app: 'codex',
    label: 'Codex',
    configFormat: 'toml',
    buildConfig: buildCodexConfigToml,
  },
  {
    app: 'opencode',
    label: 'OpenCode',
    configFormat: 'json',
    buildConfig: buildOpenCodeConfigJson,
  },
  {
    app: 'openclaw',
    label: 'OpenClaw',
    configFormat: 'json',
    buildConfig: buildOpenClawConfigJson,
  },
];

function selectedModel(model?: string): string {
  const value = model?.trim();
  return value || DEFAULT_MODEL;
}

function selectedAnthropicBaseUrl(anthropicBaseUrl?: string): string {
  const value = anthropicBaseUrl?.trim().replace(/\/+$/, '');
  return value || TOKENMP_ANTHROPIC_BASE_URL;
}

function selectedOpenAIBaseUrl(openAIBaseUrl?: string): string {
  const value = openAIBaseUrl?.trim().replace(/\/+$/, '');
  return value || TOKENMP_OPENAI_BASE_URL;
}

function appendPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** base64url 编码（兼容浏览器 btoa） */
function encodeConfigParam(config: string): string {
  return btoa(config).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 规范化 Anthropic base URL：取 origin */
export function buildAnthropicBaseUrl(currentUrl?: string): string {
  const value = currentUrl?.trim();
  if (!value) return TOKENMP_ANTHROPIC_BASE_URL;
  try {
    return new URL(value).origin;
  } catch {
    return TOKENMP_ANTHROPIC_BASE_URL;
  }
}

/** 规范化 OpenAI base URL：取 origin 后追加 /v1 */
export function buildOpenAIBaseUrl(currentUrl?: string): string {
  const value = currentUrl?.trim();
  if (!value) return TOKENMP_OPENAI_BASE_URL;
  try {
    return appendPath(new URL(value).origin, '/v1');
  } catch {
    return TOKENMP_OPENAI_BASE_URL;
  }
}

export interface ProviderDeepLinkInput {
  app: CCSwitchApp;
  apiKey: string;
  endpoint: string;
  model?: string;
  providerName?: string;
  config?: string;
  configFormat?: 'json' | 'toml' | 'yaml';
  enabled?: boolean;
}

/** 构造 CC Switch provider 导入 deeplink */
export function buildProviderDeepLink(input: ProviderDeepLinkInput): string {
  const model = selectedModel(input.model);
  const params = new URLSearchParams({
    resource: 'provider',
    app: input.app,
    name: input.providerName?.trim() || 'TokenMP',
    endpoint: input.endpoint.trim().replace(/\/+$/, ''),
    apiKey: input.apiKey,
    model,
    enabled: input.enabled === false ? 'false' : 'true',
  });

  if (input.config) params.set('config', encodeConfigParam(input.config));
  if (input.configFormat) params.set('configFormat', input.configFormat);

  return `ccswitch://v1/import?${params.toString()}`;
}

export interface ClaudeProviderDeepLinkInput {
  apiKey: string;
  model?: string;
  providerName?: string;
  anthropicBaseUrl?: string;
}

/** 构造 Claude Code provider 导入 deeplink（额外带 haiku/sonnet/opus model） */
export function buildClaudeProviderDeepLink(input: ClaudeProviderDeepLinkInput): string {
  const model = selectedModel(input.model);
  const link = buildProviderDeepLink({
    app: 'claude',
    apiKey: input.apiKey,
    endpoint: selectedAnthropicBaseUrl(input.anthropicBaseUrl),
    model,
    providerName: input.providerName,
  });
  const url = new URL(link);
  url.searchParams.set('haikuModel', model);
  url.searchParams.set('sonnetModel', model);
  url.searchParams.set('opusModel', model);
  return url.toString();
}

/* ----------------------- 各工具原生配置生成 ----------------------- */

export function buildCodexConfigToml(input: { model?: string; openAIBaseUrl?: string }): string {
  const model = selectedModel(input.model);
  const openAIBaseUrl = selectedOpenAIBaseUrl(input.openAIBaseUrl);
  return [
    'model_provider = "tokenmp"',
    `model = ${JSON.stringify(model)}`,
    '',
    '[model_providers.tokenmp]',
    `base_url = ${JSON.stringify(openAIBaseUrl)}`,
    'wire_api = "responses"',
    'supports_websockets = false',
    'requires_openai_auth = true',
  ].join('\n');
}

export function buildOpenCodeConfigJson(input: { model?: string; openAIBaseUrl?: string }): string {
  const model = selectedModel(input.model);
  const openAIBaseUrl = selectedOpenAIBaseUrl(input.openAIBaseUrl);
  return JSON.stringify(
    {
      $schema: 'https://opencode.ai/config.json',
      provider: {
        tokenmp: {
          npm: '@ai-sdk/openai-compatible',
          options: { baseURL: openAIBaseUrl },
          models: {
            [model]: { limit: { context: 202752, output: 131072 } },
          },
        },
      },
    },
    null,
    2,
  );
}

export function buildOpenClawConfigJson(input: { model?: string; openAIBaseUrl?: string }): string {
  const model = selectedModel(input.model);
  const openAIBaseUrl = selectedOpenAIBaseUrl(input.openAIBaseUrl);
  return JSON.stringify(
    {
      $schema: 'https://openclaw.ai/schema/openclaw.json',
      providers: {
        tokenmp: {
          baseUrl: openAIBaseUrl,
          apiKey: '${OPENAI_API_KEY}',
          api: 'openai-completions',
          models: [{ id: model, name: model, contextWindow: 202752 }],
        },
      },
    },
    null,
    2,
  );
}

/** 通用导入入口：根据目标工具构造对应 deeplink */
export function buildImportDeepLink(
  target: ToolImportTarget,
  opts: { apiKey: string; keyName?: string; model?: string; currentOrigin?: string },
): string {
  const providerName = opts.keyName?.trim()
    ? `TokenMP - ${target.label} - ${opts.keyName.trim()}`
    : `TokenMP - ${target.label}`;

  if (target.app === 'claude') {
    return buildClaudeProviderDeepLink({
      apiKey: opts.apiKey,
      model: opts.model,
      providerName,
      anthropicBaseUrl: buildAnthropicBaseUrl(opts.currentOrigin),
    });
  }
  const openAIBaseUrl = buildOpenAIBaseUrl(opts.currentOrigin);
  return buildProviderDeepLink({
    app: target.app,
    apiKey: opts.apiKey,
    endpoint: openAIBaseUrl,
    model: opts.model,
    providerName,
    config: target.buildConfig?.({ model: opts.model, openAIBaseUrl }),
    configFormat: target.configFormat,
  });
}
