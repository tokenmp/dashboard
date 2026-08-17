/**
 * 上游与模型相关类型
 */

/** 供应商（带计数） */
export interface ProviderItem {
  id: string;
  name: string;
  display_name: string | null;
  base_url: string;
  status: string;
  /** 品牌 Logo 外链（优先） */
  logo_url: string | null;
  /** 品牌 Logo 的 SVG 源码（上传） */
  logo_svg: string | null;
  endpoint_count: number;
  key_count: number;
  /** 供应商级思考深度配置;null = 未配置 */
  thinking: { supported_efforts?: string[] | null; default_effort?: string | null } | null;
  created_at: string;
  updated_at: string;
}

/** 供应商端点 */
export interface ProviderEndpointItem {
  id: string;
  provider_id: string;
  protocol: string;
  path: string;
  status: string;
  kind: string | null;
  adapter: string | null;
  method: string | null;
  auth_type: string | null;
  request_mode: string | null;
}

/** 上游 Key（脱敏后） */
export interface UpstreamKeyItem {
  id: string;
  provider_id: string;
  name: string;
  key_prefix: string | null;
  key_suffix: string | null;
  max_concurrency: number;
  priority: number;
  quota_type: string;
  quota_total: number | null;
  quota_used: string;
  cost: number | null;
  expires_at: string | null;
  status: string;
  notes: string | null;
  owner_user_id: string | null;
  source_type: string;
  /** key 级计费模式：plan=照常扣套餐；free=仅用户自有 key 免扣（executor 000074） */
  billing_mode: string;
  visibility: string;
  review_status: string;
  market_status: string;
  verified_at: string | null;
  last_validation_error: string | null;
  total_attempts: number | string;
  total_success_attempts: number | string;
  created_at: string;
  updated_at: string;
  provider?: { id: string; name: string; display_name: string | null; logo_url?: string | null; logo_svg?: string | null } | null;
  ownerUser?: { id: string; email: string } | null;
}

/** 上游 Key 详情 */
export interface UpstreamKeyDetailResult {
  key: UpstreamKeyItem;
  mappings: UpstreamModelMappingItem[];
  routeGroups: { id: string; name: string; display_name: string | null; is_system: boolean; status: string }[];
  verifications: UpstreamKeyVerificationItem[];
}

/** 模型映射（含模型名、端点、单价） */
export interface UpstreamModelMappingItem {
  id: string;
  upstream_key_id: string;
  model_id: string;
  provider_endpoint_id: string | null;
  upstream_model_name: string | null;
  input_price_per_token: number | null;
  output_price_per_token: number | null;
  max_tokens: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  model?: { id: string; name: string; context_window_tokens?: number | null } | null;
  providerEndpoint?: { id: string; protocol: string; path: string } | null;
}

/** 校验记录 */
export interface UpstreamKeyVerificationItem {
  id: string;
  upstream_key_id: string;
  status: string;
  http_status: number | null;
  latency_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  verified_models: string[];
  created_at: string;
}

/** 路由组（带成员计数） */
export interface RouteGroupItem {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  is_system: boolean;
  status: string;
  member_count: number;
  created_at: string;
  updated_at: string;
}

/** 平台模型的供应商映射 */
export interface AiModelProvider {
  mapping_id: string;
  provider_id?: string;
  provider_name: string;
  provider_display_name: string | null;
  provider_logo_url?: string | null;
  provider_logo_svg?: string | null;
  upstream_key_name: string;
  upstream_key_id: string;
  upstream_model_name: string | null;
  input_price_per_token: number | null;
  output_price_per_token: number | null;
  max_tokens: number | null;
  status: string;
  effective_multiplier: number;
}

/** 平台模型 */
export interface ModelKeyHealthPoint {
  hour: string;
  total: number;
  success: number;
  failed: number;
}

export interface ModelKeyHealthItem {
  upstream_key_id: string;
  series: ModelKeyHealthPoint[];
}

export interface AiModelItem {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  capabilities: string[];
  context_window_tokens: number | null;
  /** 模型级最大输出；null/0 = 未声明，/v1/models 回退取活跃映射 MAX(max_tokens) */
  max_tokens: number | null;
  /** 模型级思考深度配置；null = 未配置 */
  thinking: { supported_efforts?: string[] | null; default_effort?: string | null } | null;
  billing_mode: string;
  metadata: Record<string, unknown>;
  status: string;
  success_rate: number | null;
  request_count_24h: number;
  created_at: string;
  updated_at: string;
  providers: AiModelProvider[];
  /** /v1/models 可见性诊断（list 接口附带；true = 会被 executor 加载） */
  v1_visible?: boolean;
  /** 不可被 /v1/models 加载的原因列表（空数组/缺省 = 正常） */
  v1_issues?: string[];
}

/** 模型映射（管理面，含 disabled） */
export interface ModelMappingItem {
  id: string;
  upstream_key_id: string;
  upstream_key_name: string;
  upstream_key_status: string;
  upstream_model_name: string | null;
  input_price_per_token: number | null;
  output_price_per_token: number | null;
  max_tokens: number | null;
  /** 映射级上下文窗口；null = 未声明，沿用模型级 context_window_tokens */
  context_window_tokens: number | null;
  /** 映射级思考深度配置；null = 继承模型级/供应商级 */
  thinking: { supported_efforts?: string[] | null; default_effort?: string | null } | null;
  /** 继承链解析后的生效配置（映射→模型→供应商） */
  thinking_effective: { supported_efforts?: string[] | null; default_effort?: string | null } | null;
  /** 生效配置来源：mapping / model / provider / null(内置默认) */
  thinking_source: string | null;
  status: string;
  provider_endpoint_id: string | null;
  provider_id?: string;
  provider_name: string;
  provider_display_name: string | null;
  provider_logo_url?: string | null;
  provider_logo_svg?: string | null;
  protocol: string | null;
  endpoint_path: string | null;
  route_group_ids: string[];
  created_at: string;
}

/** 路由组（映射编辑用） */
export interface RouteGroupOption {
  id: string;
  name: string;
  display_name: string | null;
  is_system: boolean;
}

/** 可选上游 key */
export interface UpstreamKeyOption {
  id: string;
  name: string;
  status: string;
  provider_id?: string;
  provider_name: string;
  provider_display_name: string | null;
  logo_url?: string | null;
  logo_svg?: string | null;
}

/** 通用列表查询 */
export interface UpstreamQuery {
  page?: number;
  size?: number;
  keyword?: string;
  status?: string;
  sourceType?: string;
  marketStatus?: string;
  providerId?: string;
  billingMode?: string;
  series?: string;
  from?: string;
  to?: string;
  sort?: string;
}

/** 自建上游 create-options：可选供应商（带模板模型数） */
export interface UpstreamProviderOption {
  id: string;
  name: string;
  display_name: string | null;
  logo_url: string | null;
  logo_svg: string | null;
  model_count: number;
}

/** 自建上游 create-options：供应商下可选模型（来自平台模板映射） */
export interface UpstreamModelOption {
  id: string;
  name: string;
  display_name: string | null;
  capabilities: string[];
  billing_mode: string;
  upstream_model_name: string | null;
  max_tokens: number | null;
  context_window_tokens: number | null;
}

/** create-options 响应：无 provider_id 时返回 providers，有则返回 provider+models */
export interface UpstreamCreateOptionsResult {
  providers?: UpstreamProviderOption[];
  provider?: { id: string; name: string; display_name: string | null };
  models?: UpstreamModelOption[];
}

/** 探测结果 */
export interface UpstreamProbeResult {
  status: string;
  http_status: number | null;
  latency_ms: number;
  error_code: string;
  error_message: string;
  verified_models: string[];
}
