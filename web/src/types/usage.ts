/**
 * 计费用量相关类型
 */

/** 用量流水 */
export interface UsageLedgerItem {
  id: string;
  user_id: string;
  request_log_id: string | null;
  ledger_type: string;
  billing_plan: string;
  token_delta: string;
  request_delta: number;
  reason: string | null;
  created_at: string;
}

/** 时间桶聚合（最近扣费趋势） */
export interface UsageTimelineItem {
  billing_plan: string;
  bucket: string;
  token_delta: number;
  request_delta: number;
  cnt: number;
}

/** 按模型聚合扣费 */
export interface UsageByModelItem {
  billing_plan: string;
  model: string;
  token_charge: number;
  request_charge: number;
  cnt: number;
}

/** 额度项（平台/用户共用） */
export interface QuotaItem {
  billingPlan: string;
  unit: string;
  balance: number;
  reserved: number;
  available: number;
  chargedIn?: number;
  used?: number;
}

/** Top 用户（admin） */
export interface TopUser {
  id: string;
  email: string;
  role: string;
  tokenBalance: number;
  requestBalance: number;
}

export interface AdminQuota {
  role: 'admin';
  platform: QuotaItem[];
  topUsers: TopUser[];
}

export interface UserQuota {
  role: 'user';
  plans: QuotaItem[];
}

export type QuotaResult = AdminQuota | UserQuota;

/** 计费倍率规则 */
export interface PriceRuleItem {
  id: string;
  provider_id: string | null;
  upstream_key_id: string | null;
  model_id: string | null;
  protocol: string | null;
  timezone: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  multiplier: number;
  compose_mode: string;
  priority: number;
  exclusive_group: string | null;
  effective_from: string | null;
  effective_until: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface UsageQuery {
  page?: number;
  size?: number;
  keyword?: string;
  ledgerType?: string;
  billingPlan?: string;
  protocol?: string;
  composeMode?: string;
  userId?: string;
  topN?: number;
  from?: string;
  to?: string;
  sort?: string;
}
