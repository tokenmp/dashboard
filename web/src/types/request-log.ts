/**
 * 请求日志相关类型
 */

/** 请求日志列表项（裁剪字段，不含 request_body） */
export interface RequestLogItem {
  id: string;
  user_id: string | null;
  user_api_key_id: string | null;
  user_email: string | null;
  /** 使用的 API Key 名称（列表 join user_api_keys） */
  api_key_name: string | null;
  request_id: string | null;
  trace_id: string | null;
  model_name: string | null;
  requested_model_name: string | null;
  resolved_model_name: string | null;
  route_group_name: string | null;
  requested_provider_name: string | null;
  protocol: string | null;
  stream: boolean;
  billing_plan: string | null;
  billing_source: string | null;
  billing_plan_name: string | null;
  billing_charge_requests: number;
  billing_charge_tokens: number;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cache_tokens: number | null;
  usage_status: string;
  final_status_code: number | null;
  success: boolean | null;
  latency_ms: number | null;
  ttft_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  provider_error_code: string | null;
  provider_error_type: string | null;
  provider_http_status: number | null;
  thinking_mode: boolean;
  thinking_effort: string | null;
  thinking_effort_original: string | null;
  thinking_effort_degraded: boolean;
  created_at: string;
  completed_at: string | null;
}

/** 请求详情（完整字段） */
export interface RequestLogDetail extends RequestLogItem {
  request_body: string | null;
  response_started: boolean;
  disconnect_stage: string | null;
  upstream_status: number | null;
  billing_user_plan_id: string | null;
  billing_plan_id: string | null;
}

/** 单次上游尝试 */
export interface RequestAttemptItem {
  id: string;
  request_log_id: string;
  upstream_key_id: string | null;
  provider_id: string | null;
  provider_name: string | null;
  upstream_url: string | null;
  upstream_key_name: string | null;
  status_code: number | null;
  latency_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  attempt_index: number;
  created_at: string;
  request_id: string | null;
  trace_id: string | null;
  provider_error_code: string | null;
  provider_error_type: string | null;
  provider_http_status: number | null;
  metadata: Record<string, unknown>;
}

/** 阶段事件 */
export interface RequestLogEventItem {
  id: string;
  request_log_id: string;
  request_id: string | null;
  trace_id: string | null;
  stage: string;
  status: string;
  message: string | null;
  upstream_key_id: string | null;
  provider_id: string | null;
  upstream_url: string | null;
  attempt_index: number | null;
  status_code: number | null;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** 请求详情响应 */
export interface RequestLogDetailResult {
  log: RequestLogDetail;
  attempts: RequestAttemptItem[];
  events: RequestLogEventItem[];
}

/** 请求日志列表查询参数 */
export interface RequestLogQuery {
  page?: number;
  size?: number;
  keyword?: string;
  model?: string;
  protocol?: string;
  billingPlan?: string;
  usageStatus?: string;
  success?: string;
  userId?: string;
  userApiKeyId?: string;
  from?: string;
  to?: string;
  sort?: string;
}
