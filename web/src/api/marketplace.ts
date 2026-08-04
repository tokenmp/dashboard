import client from './client';
import type { ApiResponse } from '@/types';
import type { PageResult } from '@/types/common';
import { toParams } from '@/types/common';
import type {
  MarketplaceListingItem,
  MarketplaceSettlementItem,
  MarketplaceLedgerItem,
  MarketplaceQuery,
} from '@/types/marketplace';

/** 挂单：GET /marketplace/listings */
export async function getListingsApi(params: MarketplaceQuery): Promise<PageResult<MarketplaceListingItem>> {
  const res = await client.get<ApiResponse<PageResult<MarketplaceListingItem>>>('/marketplace/listings', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

/** 结算单：GET /marketplace/settlements */
export async function getSettlementsApi(params: MarketplaceQuery): Promise<PageResult<MarketplaceSettlementItem>> {
  const res = await client.get<ApiResponse<PageResult<MarketplaceSettlementItem>>>('/marketplace/settlements', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

/** 账本：GET /marketplace/ledger */
export async function getLedgerApi(params: MarketplaceQuery): Promise<PageResult<MarketplaceLedgerItem>> {
  const res = await client.get<ApiResponse<PageResult<MarketplaceLedgerItem>>>('/marketplace/ledger', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
