/**
 * 兑换码相关类型
 */

/** 兑换码（脱敏，无 code_hash/code_plaintext） */
export interface RedeemCodeItem {
  id: string;
  name: string;
  code_prefix: string | null;
  code_suffix: string | null;
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
  created_at: string;
  user?: { id: string; email: string } | null;
  codingPlan?: { id: string; name: string; plan_type: string } | null;
  tokenPlan?: { id: string; name: string; plan_type: string } | null;
  imagePlan?: { id: string; name: string; plan_type: string } | null;
}

/** 某码兑换记录响应 */
export interface CodeRedemptionsResult {
  code: Pick<RedeemCodeItem, 'id' | 'name' | 'code_prefix' | 'code_suffix' | 'token_amount' | 'max_redemptions' | 'redeemed_count' | 'status' | 'expires_at' | 'starts_at'>;
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
