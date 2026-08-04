import client from './client';
import type { ApiResponse } from '@/types';
import type { PageResult } from '@/types/common';
import { toParams } from '@/types/common';
import type {
  ProviderItem,
  UpstreamKeyItem,
  UpstreamKeyDetailResult,
  RouteGroupItem,
  AiModelItem,
  UpstreamQuery,
} from '@/types/upstream';

/** 供应商：GET /upstream/providers */
export async function getProvidersApi(params: UpstreamQuery): Promise<PageResult<ProviderItem>> {
  const res = await client.get<ApiResponse<PageResult<ProviderItem>>>('/upstream/providers', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

/** 上游 Key 列表：GET /upstream/keys */
export async function getUpstreamKeysApi(params: UpstreamQuery): Promise<PageResult<UpstreamKeyItem>> {
  const res = await client.get<ApiResponse<PageResult<UpstreamKeyItem>>>('/upstream/keys', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

/** 上游 Key 详情：GET /upstream/keys/:id */
export async function getUpstreamKeyDetailApi(id: string): Promise<UpstreamKeyDetailResult> {
  const res = await client.get<ApiResponse<UpstreamKeyDetailResult>>(`/upstream/keys/${id}`);
  return res.data.data;
}

/** 路由组：GET /upstream/routes */
export async function getRouteGroupsApi(params: UpstreamQuery): Promise<PageResult<RouteGroupItem>> {
  const res = await client.get<ApiResponse<PageResult<RouteGroupItem>>>('/upstream/routes', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

/** 平台模型：GET /models */
export async function getModelsApi(params: UpstreamQuery): Promise<PageResult<AiModelItem>> {
  const res = await client.get<ApiResponse<PageResult<AiModelItem>>>('/models', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
