import client from './client';
import type { ApiResponse } from '@/types';
import type { PageResult } from '@/types/common';
import { toParams } from '@/types/common';
import type { UsageLedgerItem, QuotaResult, PriceRuleItem, UsageQuery } from '@/types/usage';

/** 用量流水：GET /usage/ledger */
export async function getUsageLedgerApi(params: UsageQuery): Promise<PageResult<UsageLedgerItem>> {
  const res = await client.get<ApiResponse<PageResult<UsageLedgerItem>>>('/usage/ledger', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

/** 额度汇总：GET /usage/quota */
export async function getUsageQuotaApi(topN?: number): Promise<QuotaResult> {
  const res = await client.get<ApiResponse<QuotaResult>>('/usage/quota', {
    params: toParams(topN ? { topN } : {}),
  });
  return res.data.data;
}

/** 计费规则：GET /price/rules */
export async function getPriceRulesApi(params: UsageQuery): Promise<PageResult<PriceRuleItem>> {
  const res = await client.get<ApiResponse<PageResult<PriceRuleItem>>>('/price/rules', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
