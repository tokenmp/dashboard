import client from './client';
import type { ApiResponse } from '@/types';
import type { SiteModel, SiteOverview, SitePlan } from '@/types/site';

/** 模型广场：模型目录 + 当前时刻用户侧倍率（公开） */
export async function getSiteModelsApi(): Promise<SiteModel[]> {
  const res = await client.get<ApiResponse<{ list: SiteModel[] }>>('/site/models');
  return res.data.data.list;
}

/** 套餐目录：上架中的套餐模板（公开） */
export async function getSitePlansApi(): Promise<SitePlan[]> {
  const res = await client.get<ApiResponse<{ list: SitePlan[] }>>('/site/plans');
  return res.data.data.list;
}

/** 站点统计：模型数 / 供应商数 / 最低倍率（公开） */
export async function getSiteOverviewApi(): Promise<SiteOverview> {
  const res = await client.get<ApiResponse<SiteOverview>>('/site/overview');
  return res.data.data;
}
