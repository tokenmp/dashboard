/**
 * 系统与通知相关类型
 */

/** 公告 */
export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  severity: string;
  scope: string;
  dismissible: boolean;
  status: string;
  sort_order: number;
  publish_from: string;
  publish_until: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 通知 */
export interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  severity: string;
  action_label: string | null;
  action_url: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  expires_at: string | null;
  created_at: string;
  idempotency_key: string | null;
}

/** 版本发布 */
export interface VersionReleaseItem {
  id: string;
  version: string;
  title: string;
  summary: string | null;
  body: string;
  release_type: string;
  released_at: string;
  status: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReleaseDetailResult {
  release: VersionReleaseItem;
  readAt: string | null;
}

/** 系统配置 */
export interface SystemConfigItem {
  key: string;
  value: unknown;
  sensitive: boolean;
  updated_at: string;
}

/** 迁移记录 */
export interface SchemaMigrationItem {
  filename: string;
  applied_at: string;
}

export interface SystemQuery {
  page?: number;
  size?: number;
  keyword?: string;
  status?: string;
  unread?: string;
  type?: string;
  from?: string;
  to?: string;
  sort?: string;
}
