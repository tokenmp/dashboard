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
  created_at: string;
  updated_at: string;
}

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
  hourly_5h_limit: number | null;
  weekly_limit: number | null;
  monthly_limit: number | null;
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
