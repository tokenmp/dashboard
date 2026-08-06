/**
 * 兑换码相关类型
 */

/** 兑换码 */
export interface RedeemCodeItem {
  id: string;
  name: string;
  code_prefix: string | null;
  code_suffix: string | null;
  /** 明文码（后台不脱敏，直接返回） */
  code_plaintext: string | null;
  token_amount: number;
  max_redemptions: number;
  redeemed_count: number;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  override_mode: string;
  duration_days: number | null;
  coding_plan_id: string | null;
  token_plan_id: string | null;
  image_plan_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 兑换记录（含用户） */
export interface RedeemCodeRedemptionItem {
  id: string;
  redeem_code_id: string;
  user_id: string;
  token_amount: number;
  ledger_id: string | null;
  coding_plan_id: string | null;
  token_plan_id: string | null;
  image_plan_id: string | null;
  coding_user_plan_id: string | null;
  token_user_plan_id: string | null;
  image_user_plan_id: string | null;
  /** 兑换时使用的码明文快照 */
  code: string | null;
  created_at: string;
  user?: { id: string; email: string } | null;
  codingPlan?: { id: string; name: string; plan_type: string } | null;
  tokenPlan?: { id: string; name: string; plan_type: string } | null;
  imagePlan?: { id: string; name: string; plan_type: string } | null;
}

/** 某码兑换记录响应 */
export interface CodeRedemptionsResult {
  code: Pick<RedeemCodeItem, 'id' | 'name' | 'code_prefix' | 'code_suffix' | 'code_plaintext' | 'token_amount' | 'max_redemptions' | 'redeemed_count' | 'status' | 'expires_at' | 'starts_at'>;
  pagination: { list: RedeemCodeRedemptionItem[]; page: number; size: number; total: number };
}

export interface RedeemCodeQuery {
  page?: number;
  size?: number;
  keyword?: string;
  status?: string;
  from?: string;
  to?: string;
  sort?: string;
}

/** 新建兑换码的奖励配置 */
export interface CreateRedeemCodeInput {
  name: string;
  /** 自定义兑换码明文；留空则后端随机生成 */
  code?: string;
  token_amount?: number;
  max_redemptions?: number;
  starts_at?: string;
  expires_at?: string;
  override_mode?: 'replace' | 'upgrade_only';
  duration_days?: number | null;
  coding_plan_id?: string | null;
  token_plan_id?: string | null;
  image_plan_id?: string | null;
}

/** 新建兑换码返回（含明文码，仅此一次） */
export interface CreateRedeemCodeResult extends Omit<RedeemCodeItem, 'code_prefix' | 'code_suffix'> {
  /** 明文码，仅创建时返回一次，用于分发给用户 */
  code: string;
}
