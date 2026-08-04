/**
 * 概览仪表盘响应（admin / user 两种形态）
 */

export interface TrendPoint {
  /** YYYY-MM-DD */
  day: string;
  requests: number;
  tokens: number;
  successes: number;
}

/** 管理员 KPI */
export interface AdminKpi {
  totalUsers: number;
  activeUsers: number;
  /** 近 7 天活跃用户（发起过请求） */
  activeUsers7d: number;
  activeUpstreamKeys: number;
  todayRequests: number;
  todayTokens: number;
  /** 今日成功率 0~1，无数据时为 null */
  todaySuccessRate: number | null;
}

/** 普通用户 KPI */
export interface UserKpi {
  todayRequests: number;
  todayTokens: number;
  todaySuccessRate: number | null;
}

/** 单个计费类型的额度 */
export interface QuotaItem {
  billingPlan: string;
  /** 计费单位：requests（coding）/ tokens（token、image） */
  unit: 'requests' | 'tokens';
  /** 余额（已充 − 已用） */
  balance: number;
  /** 当前预扣（未结算） */
  reserved: number;
  /** 可用 = 余额 − 预扣 */
  available: number;
}

export interface AdminOverview {
  role: 'admin';
  kpi: AdminKpi;
  trend: TrendPoint[];
}

export interface UserOverview {
  role: 'user';
  kpi: UserKpi;
  quota: QuotaItem[];
  trend: TrendPoint[];
}

export type DashboardOverview = AdminOverview | UserOverview;
