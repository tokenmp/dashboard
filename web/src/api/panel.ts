import client from './client';
import type { ApiResponse } from '@/types';
import type { PageResult } from '@/types/common';
import { toParams } from '@/types/common';
import type { UserOverview } from '@/types/dashboard';
import type {
  RequestLogItem,
  RequestLogDetailResult,
  RequestLogQuery,
} from '@/types/request-log';
import type {
  UserBasic,
  UserApiKeyItem,
  BotKeyItem,
  UserPlanItem,
} from '@/types/user';
import type { NotificationItem, SystemQuery } from '@/types/system';
import type { RedeemCodeRedemptionItem } from '@/types/redeem';
import type {
  AiModelItem,
  ModelKeyHealthItem,
  UpstreamKeyItem,
  UpstreamKeyDetailResult,
  UpstreamQuery,
  UpstreamCreateOptionsResult,
  UpstreamProbeResult,
} from '@/types/upstream';
import type { UsageLedgerItem, QuotaResult, UsageQuery, UsageTimelineItem, UsageByModelItem, ModelRankItem, ModelRankPeriod } from '@/types/usage';
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
} from '@/types/system';

/*
|--------------------------------------------------------------------------
| 用户面 panel API（自取数据，/api/v1/panel/*）
|--------------------------------------------------------------------------
| 管理员在 panel 同样只取自己的数据（后端 DataScope::forSelf）。
| 函数命名统一 getPanel*Api，与 dashboard 命名空间一一对照。
*/

// ── 概览 ──
export async function getPanelOverviewApi(): Promise<UserOverview> {
  const res = await client.get<ApiResponse<UserOverview>>('/panel/overview');
  return res.data.data;
}
export async function getPanelOverviewModelsApi(
  period: ModelRankPeriod,
): Promise<ModelRankItem[]> {
  const res = await client.get<ApiResponse<ModelRankItem[]>>('/panel/overview/models', {
    params: { period },
  });
  return res.data.data;
}

// ── 我的请求日志 ──
export async function getPanelRequestsApi(
  params: RequestLogQuery,
): Promise<PageResult<RequestLogItem>> {
  const res = await client.get<ApiResponse<PageResult<RequestLogItem>>>('/panel/requests', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getPanelRequestDetailApi(
  id: string,
): Promise<RequestLogDetailResult> {
  const res = await client.get<ApiResponse<RequestLogDetailResult>>(`/panel/requests/${id}`);
  return res.data.data;
}

// ── 我的账户 ──
export async function getPanelProfileApi(): Promise<UserBasic> {
  const res = await client.get<ApiResponse<UserBasic>>('/panel/user');
  return res.data.data;
}
export async function updatePanelPlanStrategyApi(strategy: string): Promise<{ coding_plan_strategy: string }> {
  const res = await client.put<ApiResponse<{ coding_plan_strategy: string }>>('/panel/user/plan-strategy', { strategy });
  return res.data.data;
}

export async function getPanelKeysApi(): Promise<UserApiKeyItem[]> {
  const res = await client.get<ApiResponse<UserApiKeyItem[]>>('/panel/user/keys');
  return res.data.data;
}
export async function getPanelBotKeysApi(): Promise<BotKeyItem[]> {
  const res = await client.get<ApiResponse<BotKeyItem[]>>('/panel/user/keys/bot');
  return res.data.data;
}

/** 创建密钥返回（含明文 key，仅此一次） */
export interface CreatedKey {
  id: string;
  name: string;
  status: string;
  key_prefix: string;
  key_suffix: string;
  key: string;
  created_at: string;
}
export async function createPanelKeyApi(body: { name: string }): Promise<CreatedKey> {
  const res = await client.post<ApiResponse<CreatedKey>>('/panel/user/keys', body);
  return res.data.data;
}
export async function updatePanelKeyApi(id: string, body: { name?: string; status?: string }): Promise<UserApiKeyItem> {
  const res = await client.put<ApiResponse<UserApiKeyItem>>(`/panel/user/keys/${id}`, body);
  return res.data.data;
}
export async function deletePanelKeyApi(id: string): Promise<{ id: string }> {
  const res = await client.delete<ApiResponse<{ id: string }>>(`/panel/user/keys/${id}`);
  return res.data.data;
}
export async function createPanelBotKeyApi(body: { name: string }): Promise<CreatedKey & { scope: string }> {
  const res = await client.post<ApiResponse<CreatedKey & { scope: string }>>('/panel/user/keys/bot', body);
  return res.data.data;
}
export async function updatePanelBotKeyApi(id: string, body: { name?: string; status?: string }): Promise<BotKeyItem> {
  const res = await client.put<ApiResponse<BotKeyItem>>(`/panel/user/keys/bot/${id}`, body);
  return res.data.data;
}
export async function deletePanelBotKeyApi(id: string): Promise<{ id: string }> {
  const res = await client.delete<ApiResponse<{ id: string }>>(`/panel/user/keys/bot/${id}`);
  return res.data.data;
}
export async function getPanelPlansApi(): Promise<UserPlanItem[]> {
  const res = await client.get<ApiResponse<UserPlanItem[]>>('/panel/user/plans');
  return res.data.data;
}
export async function getPanelNotificationsApi(
  params: SystemQuery,
): Promise<PageResult<NotificationItem>> {
  const res = await client.get<ApiResponse<PageResult<NotificationItem>>>('/panel/user/notifications', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function markPanelNotificationReadApi(id: string): Promise<void> {
  await client.post(`/panel/user/notifications/${id}/read`);
}
export async function markAllPanelNotificationsReadApi(): Promise<number> {
  const res = await client.post<ApiResponse<{ updated: number }>>('/panel/user/notifications/read-all');
  return res.data.data.updated;
}
export async function getPanelRedemptionsApi(): Promise<RedeemCodeRedemptionItem[]> {
  const res = await client.get<ApiResponse<RedeemCodeRedemptionItem[]>>('/panel/user/redemptions');
  return res.data.data;
}

/** 兑换结果：含脱敏码信息 + 本次兑换记录快照 */
export interface RedeemResult {
  code: { id: string; name: string; prefix: string | null; suffix: string | null };
  redemption: RedeemCodeRedemptionItem;
}

/** 兑换一个兑换码 */
export async function redeemCodeApi(code: string): Promise<RedeemResult> {
  const res = await client.post<ApiResponse<RedeemResult>>('/panel/user/redeem', { code });
  return res.data.data;
}

// ── 我持有的上游 Key ──
export async function getPanelUpstreamKeysApi(
  params: UpstreamQuery,
): Promise<PageResult<UpstreamKeyItem>> {
  const res = await client.get<ApiResponse<PageResult<UpstreamKeyItem>>>('/panel/upstream/keys', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getPanelUpstreamKeyDetailApi(
  id: string,
): Promise<UpstreamKeyDetailResult> {
  const res = await client.get<ApiResponse<UpstreamKeyDetailResult>>(`/panel/upstream/keys/${id}`);
  return res.data.data;
}

// ── 自建上游 Key（自带 key + 选模型 + 计费模式）──
export async function getPanelUpstreamCreateOptionsApi(
  providerId?: string,
): Promise<UpstreamCreateOptionsResult> {
  const res = await client.get<ApiResponse<UpstreamCreateOptionsResult>>('/panel/upstream/keys/create-options', {
    params: providerId ? { provider_id: providerId } : undefined,
  });
  return res.data.data;
}
export interface CreateUpstreamKeyPayload {
  provider_id: string;
  name: string;
  key: string;
  billing_mode: 'plan' | 'free';
  model_ids: string[];
}
export async function createPanelUpstreamKeyApi(
  payload: CreateUpstreamKeyPayload,
): Promise<{ id: string }> {
  const res = await client.post<ApiResponse<{ id: string }>>('/panel/upstream/keys', payload);
  return res.data.data;
}
export async function updatePanelUpstreamKeyApi(
  id: string,
  payload: { name?: string; billing_mode?: 'plan' | 'free'; key?: string; provider_id?: string; model_ids?: string[] },
): Promise<{ id: string }> {
  const res = await client.put<ApiResponse<{ id: string }>>(`/panel/upstream/keys/${id}`, payload);
  return res.data.data;
}
export async function updatePanelUpstreamKeyStatusApi(
  id: string,
  status: 'active' | 'disabled',
): Promise<{ id: string }> {
  const res = await client.post<ApiResponse<{ id: string }>>(`/panel/upstream/keys/${id}/status`, { status });
  return res.data.data;
}
export async function deletePanelUpstreamKeyApi(id: string): Promise<{ id: string }> {
  const res = await client.delete<ApiResponse<{ id: string }>>(`/panel/upstream/keys/${id}`);
  return res.data.data;
}
export async function probePanelUpstreamKeyApi(
  id: string,
): Promise<UpstreamProbeResult> {
  const res = await client.post<ApiResponse<UpstreamProbeResult>>(`/panel/upstream/keys/${id}/probe`);
  return res.data.data;
}
export async function addPanelUpstreamKeyModelsApi(
  id: string,
  modelIds: string[],
): Promise<{ id: string }> {
  const res = await client.post<ApiResponse<{ id: string }>>(`/panel/upstream/keys/${id}/models`, { model_ids: modelIds });
  return res.data.data;
}
export async function removePanelUpstreamKeyModelApi(
  id: string,
  mappingId: string,
): Promise<{ id: string }> {
  const res = await client.delete<ApiResponse<{ id: string }>>(`/panel/upstream/keys/${id}/models/${mappingId}`);
  return res.data.data;
}
export async function getPanelModelsApi(
  params: UpstreamQuery,
): Promise<PageResult<AiModelItem>> {
  const res = await client.get<ApiResponse<PageResult<AiModelItem>>>('/panel/upstream/models', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getPanelModelNamesApi(): Promise<{ name: string }[]> {
  const res = await client.get<ApiResponse<{ name: string }[]>>('/panel/upstream/model-names');
  return res.data.data;
}
export async function getModelKeyHealthApi(modelId: string): Promise<ModelKeyHealthItem[]> {
  const res = await client.get<ApiResponse<ModelKeyHealthItem[]>>('/panel/upstream/model-key-health', {
    params: { model_id: modelId },
  });
  return res.data.data;
}

export interface SuccessBucket {
  bucket: string;
  total: number;
  success: number;
  rate: number | null;
}
export async function getModelSuccessBucketsApi(modelId: string, range: '24h' | '1h' | '15m'): Promise<SuccessBucket[]> {
  const res = await client.get<ApiResponse<SuccessBucket[]>>(`/panel/upstream/models/${modelId}/success-buckets`, {
    params: { range },
  });
  return res.data.data;
}

// ── 我的用量 ──
export async function getPanelUsageLedgerApi(
  params: UsageQuery,
): Promise<PageResult<UsageLedgerItem>> {
  const res = await client.get<ApiResponse<PageResult<UsageLedgerItem>>>('/panel/usage/ledger', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getPanelUsageQuotaApi(): Promise<QuotaResult> {
  const res = await client.get<ApiResponse<QuotaResult>>('/panel/usage/quota');
  return res.data.data;
}
export async function getPanelUsageTimelineApi(params: { interval: string; hours: number }): Promise<UsageTimelineItem[]> {
  const res = await client.get<ApiResponse<UsageTimelineItem[]>>('/panel/usage/timeline', { params });
  return res.data.data;
}
export async function getPanelUsageByModelApi(params: { hours: number }): Promise<UsageByModelItem[]> {
  const res = await client.get<ApiResponse<UsageByModelItem[]>>('/panel/usage/by-model', { params });
  return res.data.data;
}

// ── 我参与的市场分账 ──
export async function getPanelListingsApi(
  params: MarketplaceQuery,
): Promise<PageResult<MarketplaceListingItem>> {
  const res = await client.get<ApiResponse<PageResult<MarketplaceListingItem>>>('/panel/marketplace/listings', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getPanelSettlementsApi(
  params: MarketplaceQuery,
): Promise<PageResult<MarketplaceSettlementItem>> {
  const res = await client.get<ApiResponse<PageResult<MarketplaceSettlementItem>>>('/panel/marketplace/settlements', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getPanelLedgerApi(
  params: MarketplaceQuery,
): Promise<PageResult<MarketplaceLedgerItem>> {
  const res = await client.get<ApiResponse<PageResult<MarketplaceLedgerItem>>>('/panel/marketplace/ledger', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

// ── 公告 / 版本日志（仅 published）──
export async function getPanelNoticesApi(
  params: SystemQuery,
): Promise<PageResult<AnnouncementItem>> {
  const res = await client.get<ApiResponse<PageResult<AnnouncementItem>>>('/panel/notices', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getPanelReleasesApi(
  params: SystemQuery,
): Promise<PageResult<VersionReleaseItem>> {
  const res = await client.get<ApiResponse<PageResult<VersionReleaseItem>>>('/panel/releases', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
export async function getPanelReleaseDetailApi(
  id: string,
): Promise<ReleaseDetailResult> {
  const res = await client.get<ApiResponse<ReleaseDetailResult>>(`/panel/releases/${id}`);
  return res.data.data;
}
