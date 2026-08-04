import client from './client';
import type { ApiResponse } from '@/types';
import type { PageResult } from '@/types/common';
import { toParams } from '@/types/common';
import type { RedeemCodeItem, CodeRedemptionsResult, RedeemCodeQuery, RedeemCodeRedemptionItem } from '@/types/redeem';

/** 兑换码列表（admin）：GET /redeem/codes */
export async function getRedeemCodesApi(params: RedeemCodeQuery): Promise<PageResult<RedeemCodeItem>> {
  const res = await client.get<ApiResponse<PageResult<RedeemCodeItem>>>('/redeem/codes', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

/** 某码兑换记录（admin）：GET /redeem/codes/:id/redemptions */
export async function getCodeRedemptionsApi(id: string, params: RedeemCodeQuery): Promise<CodeRedemptionsResult> {
  const res = await client.get<ApiResponse<CodeRedemptionsResult>>(`/redeem/codes/${id}/redemptions`, {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

/** 我的兑换记录（user）：GET /user/redemptions */
export async function getMyRedemptionsApi(): Promise<RedeemCodeRedemptionItem[]> {
  const res = await client.get<ApiResponse<RedeemCodeRedemptionItem[]>>('/user/redemptions');
  return res.data.data;
}
