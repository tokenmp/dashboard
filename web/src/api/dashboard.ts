import client from './client';
import type { ApiResponse } from '@/types';
import type { DashboardOverview } from '@/types/dashboard';

/**
 * 概览仪表盘：GET /dashboard/overview（需鉴权，按角色返回不同指标）
 */
export async function getDashboardOverviewApi(): Promise<DashboardOverview> {
  const res = await client.get<ApiResponse<DashboardOverview>>('/dashboard/overview');
  return res.data.data;
}
