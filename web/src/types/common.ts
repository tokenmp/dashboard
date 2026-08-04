/**
 * 分页查询响应数据
 */
export interface PageResult<T> {
  list: T[];
  page: number;
  size: number;
  total: number;
}

/**
 * 分页/筛选查询参数（统一约定，见 docs/dashboard-api-plan.md §2.2）
 */
export interface PageQuery {
  page?: number;
  size?: number;
  keyword?: string;
  status?: string;
  /** 仅 admin 生效：按指定用户筛选 */
  userId?: string;
  /** ISO 8601 时间区间（落在 created_at） */
  from?: string;
  to?: string;
  /** 排序，如 -created_at（- 前缀降序） */
  sort?: string;
}

/**
 * 把查询参数序列化为 axios 的 params（剔除空值，避免发送空字符串）
 */
export function toParams<T extends Record<string, unknown>>(query: T): T {
  const params: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') {
      params[k] = v;
    }
  }
  return params as T;
}
