import client from './client';
import type { ApiResponse } from '@/types';
import type { PageResult } from '@/types/common';
import { toParams } from '@/types/common';
import type {
  AnnouncementItem,
  NotificationItem,
  VersionReleaseItem,
  ReleaseDetailResult,
  SystemConfigItem,
  SchemaMigrationItem,
  SystemQuery,
} from '@/types/system';

/** 公告：GET /system/notices */
export async function getNoticesApi(params: SystemQuery): Promise<PageResult<AnnouncementItem>> {
  const res = await client.get<ApiResponse<PageResult<AnnouncementItem>>>('/system/notices', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

/** 我的通知：GET /user/notifications */
export async function getMyNotificationsApi(params: SystemQuery): Promise<PageResult<NotificationItem>> {
  const res = await client.get<ApiResponse<PageResult<NotificationItem>>>('/user/notifications', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

/** 版本列表：GET /system/releases */
export async function getReleasesApi(params: SystemQuery): Promise<PageResult<VersionReleaseItem>> {
  const res = await client.get<ApiResponse<PageResult<VersionReleaseItem>>>('/system/releases', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

/** 版本详情：GET /system/releases/:id */
export async function getReleaseDetailApi(id: string): Promise<ReleaseDetailResult> {
  const res = await client.get<ApiResponse<ReleaseDetailResult>>(`/system/releases/${id}`);
  return res.data.data;
}

/** 系统配置：GET /system/config */
export async function getSystemConfigApi(): Promise<SystemConfigItem[]> {
  const res = await client.get<ApiResponse<SystemConfigItem[]>>('/system/config');
  return res.data.data;
}

/** 迁移台账：GET /system/migrations */
export async function getMigrationsApi(params: SystemQuery): Promise<PageResult<SchemaMigrationItem>> {
  const res = await client.get<ApiResponse<PageResult<SchemaMigrationItem>>>('/system/migrations', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}
