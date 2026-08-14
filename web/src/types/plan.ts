/**
 * 套餐目录与用户套餐绑定相关类型
 */

/** 套餐模板（管理端编辑用，含 category） */
export interface PlanItem {
  id: string;
  name: string;
  plan_type: 'coding' | 'token' | 'image';
  rolling_5h_limit: number | null;
  weekly_limit: number | null;
  cycle_limit: number | null;
  cycle_days: number | null;
  total_limit: number | null;
  token_limit: number | null;
  price: number;
  status: 'active' | 'disabled' | 'deleted';
  default_duration_days: number | null;
  allowed_model_names: string[];
  category: string | null;
  created_at: string;
  updated_at: string;
}

/** 套餐目录列表查询参数 */
export interface PlanListQuery {
  page?: number;
  size?: number;
  keyword?: string;
  plan_type?: string;
  status?: string;
  sort?: string;
}

/** 套餐新建/编辑表单 */
export interface PlanPayload {
  name: string;
  plan_type: 'coding' | 'token' | 'image';
  rolling_5h_limit: number | null;
  weekly_limit: number | null;
  cycle_limit: number | null;
  cycle_days: number | null;
  total_limit: number | null;
  token_limit: number | null;
  price: number;
  status: 'active' | 'disabled';
  default_duration_days: number | null;
  allowed_model_names: string[];
  category: string | null;
}

/** 状态变更 */
export interface PlanStatusPayload {
  status: 'active' | 'disabled' | 'deleted';
}

/** 给用户发放套餐的载荷 */
export interface GrantUserPlanPayload {
  plan_id: string;
  duration_days?: number | null;
  expires_at?: string;
  permanent?: boolean;
}

/** 续期载荷（duration_days / expires_at / permanent 三选一） */
export interface RenewUserPlanPayload {
  duration_days?: number | null;
  expires_at?: string;
  permanent?: boolean;
}
