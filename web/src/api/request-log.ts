import client from './client';
import type { ApiResponse } from '@/types';
import type { PageResult } from '@/types/common';
import { toParams } from '@/types/common';
import type {
  RequestLogItem,
  RequestLogDetailResult,
  RequestLogQuery,
} from '@/types/request-log';

/**
 * 请求日志列表：GET /requests
 */
export async function getRequestLogsApi(
  params: RequestLogQuery,
): Promise<PageResult<RequestLogItem>> {
  const res = await client.get<ApiResponse<PageResult<RequestLogItem>>>('/requests', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

/**
 * 请求日志详情：GET /requests/:id（含 attempts + events）
 */
export async function getRequestLogDetailApi(
  id: string,
): Promise<RequestLogDetailResult> {
  const res = await client.get<ApiResponse<RequestLogDetailResult>>(`/requests/${id}`);
  return res.data.data;
}
