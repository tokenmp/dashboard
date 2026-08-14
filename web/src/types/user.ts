import type { QuotaItem } from './dashboard';

/**
 * 用户与账户相关类型
 */

/** 用户基本信息（脱敏后，无 password_hash / token_version） */
export interface UserBasic {
  id: string;
  email: string;
  role: string;
  status: string;
  preferred_billing: string;
  fallback_enabled: boolean;
  /** 扣费套餐选择策略（逗号分隔有序枚举 key，见 PLAN_STRATEGIES） */
  coding_plan_strategy: string;
  created_at: string;
  updated_at: string;
}

/** 扣费套餐选择策略 key（与后端枚举一一对应；勿用任意 string） */
export type CodingPlanStrategyKey =
  | 'largest_limit'
  | 'smallest_limit'
  | 'least_remaining'
  | 'most_remaining'
  | 'soonest_expiry'
  | 'latest_expiry'
  | 'oldest_first'
  | 'newest_first';

/** 用户 API Key（脱敏） */
export interface UserApiKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  key_suffix: string;
  status: string;
  last_used_at: string | null;
  created_at: string;
}

/** Bot Key（脱敏） */
export interface BotKeyItem {
  id: string;
  name: string;
  scope: string;
  key_prefix: string;
  key_suffix: string;
  status: string;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 套餐模板 */
export interface PlanTemplate {
  id: string;
  name: string;
  plan_type: string;
  rolling_5h_limit: number | null;
  weekly_limit: number | null;
  cycle_limit: number | null;
  token_limit: number | null;
  price: number;
  status: string;
  default_duration_days: number | null;
  allowed_model_names: string[];
}

/** 用户套餐绑定（含套餐模板） */
export interface UserPlanItem {
  id: string;
  user_id: string;
  plan_id: string;
  plan_type: string;
  status: string;
  activated_at: string;
  expires_at: string | null;
  created_at: string;
  plan: PlanTemplate | null;
}

/** 用户用量汇总（按计费类型） */
export interface UserUsageSummary {
  billingPlan: string;
  tokenBalance: number;
  requestBalance: number;
}

/** 用户详情（admin） */
export interface UserDetailResult {
  user: UserBasic;
  apiKeys: UserApiKeyItem[];
  botKeys: BotKeyItem[];
  plans: UserPlanItem[];
  usage: UserUsageSummary[];
  quota: QuotaItem[];
}

/** 用户列表查询参数 */
export interface UserListQuery {
  page?: number;
  size?: number;
  keyword?: string;
  role?: string;
  status?: string;
  from?: string;
  to?: string;
  sort?: string;
}

/** 新建用户表单 */
export interface UserCreatePayload {
  email: string;
  role: string;
}

/** 编辑用户表单（均可选，仅传改动项） */
export interface UserUpdatePayload {
  role?: string;
  status?: string;
  preferred_billing?: string;
  fallback_enabled?: boolean;
}

/** 新建用户返回（含明文临时密码，仅此一次） */
export interface CreatedUser {
  id: string;
  email: string;
  role: string;
  status: string;
  password: string;
}

/** 重置密码返回（含明文新密码，仅此一次） */
export interface ResetPasswordResult {
  id: string;
  password: string;
}
