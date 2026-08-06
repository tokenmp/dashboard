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
  endpoint_count: number;
  key_count: number;
  created_at: string;
  updated_at: string;
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
  visibility: string;
  review_status: string;
  market_status: string;
  verified_at: string | null;
  last_validation_error: string | null;
  created_at: string;
  updated_at: string;
  provider?: { id: string; name: string; display_name: string | null } | null;
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
  provider_name: string;
  provider_display_name: string | null;
  upstream_key_name: string;
  upstream_key_id: string;
  upstream_model_name: string | null;
  input_price_per_token: number | null;
  output_price_per_token: number | null;
  max_tokens: number | null;
  status: string;
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
  billing_mode: string;
  metadata: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
  providers: AiModelProvider[];
}

/** 通用列表查询 */
export interface UpstreamQuery {
  page?: number;
  size?: number;
  keyword?: string;
  status?: string;
  sourceType?: string;
  marketStatus?: string;
  billingMode?: string;
  series?: string;
  from?: string;
  to?: string;
  sort?: string;
}
