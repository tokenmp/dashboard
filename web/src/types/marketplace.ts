/**
 * 市场分账相关类型
 */

/** 挂单 */
export interface MarketplaceListingItem {
  id: string;
  seller_user_id: string;
  upstream_model_mapping_id: string;
  input_sale_price_per_token: number;
  output_sale_price_per_token: number;
  input_reward_per_token: number;
  output_reward_per_token: number;
  platform_fee_rate: number;
  currency: string;
  daily_token_limit: number | null;
  monthly_token_limit: number | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  sellerUser?: { id: string; email: string } | null;
  upstreamModelMapping?: { id: string; upstream_model_name: string | null } | null;
}

/** 结算单 */
export interface MarketplaceSettlementItem {
  id: string;
  request_log_id: string;
  request_attempt_id: string | null;
  listing_id: string;
  consumer_user_id: string;
  supplier_user_id: string;
  upstream_key_id: string;
  input_tokens: number;
  output_tokens: number;
  cache_tokens: number;
  input_sale_price_per_token: number;
  output_sale_price_per_token: number;
  input_reward_per_token: number;
  output_reward_per_token: number;
  consumer_amount: number;
  supplier_reward: number;
  platform_fee: number;
  currency: string;
  usage_source: string;
  status: string;
  settled_at: string | null;
  created_at: string;
  consumerUser?: { id: string; email: string } | null;
  supplierUser?: { id: string; email: string } | null;
  listing?: { id: string; status: string } | null;
}

/** 账本流水 */
export interface MarketplaceLedgerItem {
  id: string;
  user_id: string;
  request_log_id: string | null;
  request_attempt_id: string | null;
  listing_id: string | null;
  settlement_id: string | null;
  entry_type: string;
  amount: number;
  currency: string;
  status: string;
  available_at: string | null;
  idempotency_key: string;
  metadata: Record<string, unknown>;
  created_at: string;
  listing?: { id: string; status: string } | null;
}

export interface MarketplaceQuery {
  page?: number;
  size?: number;
  keyword?: string;
  status?: string;
  usageSource?: string;
  entryType?: string;
  userId?: string;
  from?: string;
  to?: string;
  sort?: string;
}
