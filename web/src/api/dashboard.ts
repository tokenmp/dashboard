import client from './client';
import type { ApiResponse } from '@/types';
import type { PageResult } from '@/types/common';
import { toParams } from '@/types/common';
import type { AdminOverview } from '@/types/dashboard';
import type {
  RequestLogItem,
  RequestLogDetailResult,
  RequestLogQuery,
} from '@/types/request-log';
import type {
  UserBasic,
  UserDetailResult,
  UserListQuery,
  UserCreatePayload,
  UserUpdatePayload,
  CreatedUser,
  ResetPasswordResult,
} from '@/types/user';
import type { AnnouncementPayload, NotificationItem, SystemQuery } from '@/types/system';
import type {
  ProviderItem,
  UpstreamKeyItem,
  UpstreamKeyDetailResult,
  RouteGroupItem,
  AiModelItem,
  UpstreamQuery,
} from '@/types/upstream';
import type { UsageLedgerItem, QuotaResult, PriceRuleItem, UsageQuery } from '@/types/usage';
import type {
  MarketplaceListingItem,
  MarketplaceSettlementItem,
  MarketplaceLedgerItem,
  MarketplaceQuery,
} from '@/types/marketplace';
import type {
  AnnouncementItem,
  VersionReleaseItem,
  ReleaseDetailResult,
  SystemConfigItem,
  SchemaMigrationItem,
} from '@/types/system';
import type {
  RedeemCodeItem,
  CodeRedemptionsResult,
  RedeemCodeQuery,
} from '@/types/redeem';

/*
|--------------------------------------------------------------------------
| 管理面 dashboard API（全平台，/api/v1/dashboard/*）
|--------------------------------------------------------------------------
| 仅 admin 可达（后端 Auth + Admin 中间件）。函数命名统一 getDashboard*Api。
*/

// ── 概览（全平台）──
export async function getDashboardOverviewApi(): Promise<AdminOverview> {
  const res = await client.get<ApiResponse<AdminOverview>>('/dashboard/overview');
  return res.data.data;
}

// ── 全平台请求日志（可按 userId 筛选）──
export async function getDashboardRequestsApi(
  params: RequestLogQuery,
): Promise<PageResult<RequestLogItem>> {
  const res = await client.get<ApiResponse<PageResult<RequestLogItem>>>('/dashboard/requests', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getDashboardRequestDetailApi(
  id: string,
): Promise<RequestLogDetailResult> {
  const res = await client.get<ApiResponse<RequestLogDetailResult>>(`/dashboard/requests/${id}`);
  return res.data.data;
}

// ── 用户管理 ──
export async function getDashboardUsersApi(
  params: UserListQuery,
): Promise<PageResult<UserBasic>> {
  const res = await client.get<ApiResponse<PageResult<UserBasic>>>('/dashboard/users', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getDashboardUserDetailApi(id: string): Promise<UserDetailResult> {
  const res = await client.get<ApiResponse<UserDetailResult>>(`/dashboard/users/${id}`);
  return res.data.data;
}
export async function getDashboardUserNotificationsApi(
  id: string,
  params: SystemQuery,
): Promise<PageResult<NotificationItem>> {
  const res = await client.get<ApiResponse<PageResult<NotificationItem>>>(`/dashboard/users/${id}/notifications`, {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function createDashboardUserApi(
  body: UserCreatePayload,
): Promise<CreatedUser> {
  const res = await client.post<ApiResponse<CreatedUser>>('/dashboard/users', body);
  return res.data.data;
}
export async function updateDashboardUserApi(
  id: string,
  body: UserUpdatePayload,
): Promise<UserBasic> {
  const res = await client.put<ApiResponse<UserBasic>>(`/dashboard/users/${id}`, body);
  return res.data.data;
}
export async function resetDashboardUserPasswordApi(
  id: string,
): Promise<ResetPasswordResult> {
  const res = await client.post<ApiResponse<ResetPasswordResult>>(`/dashboard/users/${id}/reset-password`);
  return res.data.data;
}

// ── 上游与模型 ──
export async function getDashboardUpstreamKeysApi(
  params: UpstreamQuery,
): Promise<PageResult<UpstreamKeyItem>> {
  const res = await client.get<ApiResponse<PageResult<UpstreamKeyItem>>>('/dashboard/upstream/keys', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getDashboardUpstreamKeyDetailApi(
  id: string,
): Promise<UpstreamKeyDetailResult> {
  const res = await client.get<ApiResponse<UpstreamKeyDetailResult>>(`/dashboard/upstream/keys/${id}`);
  return res.data.data;
}
export async function getDashboardProvidersApi(
  params: UpstreamQuery,
): Promise<PageResult<ProviderItem>> {
  const res = await client.get<ApiResponse<PageResult<ProviderItem>>>('/dashboard/upstream/providers', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getDashboardRouteGroupsApi(
  params: UpstreamQuery,
): Promise<PageResult<RouteGroupItem>> {
  const res = await client.get<ApiResponse<PageResult<RouteGroupItem>>>('/dashboard/upstream/routes', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getDashboardModelsApi(
  params: UpstreamQuery,
): Promise<PageResult<AiModelItem>> {
  const res = await client.get<ApiResponse<PageResult<AiModelItem>>>('/dashboard/models', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

// ── 全平台用量 + 计费规则 ──
export async function getDashboardUsageLedgerApi(
  params: UsageQuery,
): Promise<PageResult<UsageLedgerItem>> {
  const res = await client.get<ApiResponse<PageResult<UsageLedgerItem>>>('/dashboard/usage/ledger', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getDashboardUsageQuotaApi(topN?: number): Promise<QuotaResult> {
  const res = await client.get<ApiResponse<QuotaResult>>('/dashboard/usage/quota', {
    params: toParams(topN ? { topN } : {}),
  });
  return res.data.data;
}
export async function getDashboardPriceRulesApi(
  params: UsageQuery,
): Promise<PageResult<PriceRuleItem>> {
  const res = await client.get<ApiResponse<PageResult<PriceRuleItem>>>('/dashboard/price/rules', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

// ── 全平台市场分账 ──
export async function getDashboardListingsApi(
  params: MarketplaceQuery,
): Promise<PageResult<MarketplaceListingItem>> {
  const res = await client.get<ApiResponse<PageResult<MarketplaceListingItem>>>('/dashboard/marketplace/listings', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getDashboardSettlementsApi(
  params: MarketplaceQuery,
): Promise<PageResult<MarketplaceSettlementItem>> {
  const res = await client.get<ApiResponse<PageResult<MarketplaceSettlementItem>>>('/dashboard/marketplace/settlements', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getDashboardLedgerApi(
  params: MarketplaceQuery,
): Promise<PageResult<MarketplaceLedgerItem>> {
  const res = await client.get<ApiResponse<PageResult<MarketplaceLedgerItem>>>('/dashboard/marketplace/ledger', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

// ── 公告 / 版本日志（全部）/ 系统配置 / 迁移台账 ──
export async function getDashboardNoticesApi(
  params: SystemQuery,
): Promise<PageResult<AnnouncementItem>> {
  const res = await client.get<ApiResponse<PageResult<AnnouncementItem>>>('/dashboard/notices', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function createDashboardNoticeApi(
  body: AnnouncementPayload,
): Promise<AnnouncementItem> {
  const res = await client.post<ApiResponse<AnnouncementItem>>('/dashboard/notices', body);
  return res.data.data;
}
export async function updateDashboardNoticeApi(
  id: string,
  body: AnnouncementPayload,
): Promise<AnnouncementItem> {
  const res = await client.put<ApiResponse<AnnouncementItem>>(`/dashboard/notices/${id}`, body);
  return res.data.data;
}
export async function deleteDashboardNoticeApi(id: string): Promise<{ id: string }> {
  const res = await client.delete<ApiResponse<{ id: string }>>(`/dashboard/notices/${id}`);
  return res.data.data;
}
export async function getDashboardReleasesApi(
  params: SystemQuery,
): Promise<PageResult<VersionReleaseItem>> {
  const res = await client.get<ApiResponse<PageResult<VersionReleaseItem>>>('/dashboard/releases', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getDashboardReleaseDetailApi(
  id: string,
): Promise<ReleaseDetailResult> {
  const res = await client.get<ApiResponse<ReleaseDetailResult>>(`/dashboard/releases/${id}`);
  return res.data.data;
}
export async function getDashboardConfigApi(): Promise<SystemConfigItem[]> {
  const res = await client.get<ApiResponse<SystemConfigItem[]>>('/dashboard/config');
  return res.data.data;
}
export async function getDashboardMigrationsApi(
  params: SystemQuery,
): Promise<PageResult<SchemaMigrationItem>> {
  const res = await client.get<ApiResponse<PageResult<SchemaMigrationItem>>>('/dashboard/migrations', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

// ── 兑换码管理 ──
export async function getDashboardRedeemCodesApi(
  params: RedeemCodeQuery,
): Promise<PageResult<RedeemCodeItem>> {
  const res = await client.get<ApiResponse<PageResult<RedeemCodeItem>>>('/dashboard/redeem/codes', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getDashboardCodeRedemptionsApi(
  id: string,
  params: RedeemCodeQuery,
): Promise<CodeRedemptionsResult> {
  const res = await client.get<ApiResponse<CodeRedemptionsResult>>(`/dashboard/redeem/codes/${id}/redemptions`, {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
