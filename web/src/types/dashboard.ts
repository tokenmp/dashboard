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
  /** 累计总请求数 */
  totalRequests: number;
  /** 累计总 Token 消耗 */
  totalTokens: number;
}

/** 滚动窗口（编程套餐）：某时段已用请求数与套餐限额 */
export interface QuotaWindow {
  key: string;
  label: string;
  /** 套餐限额，null 表示不限 */
  limit: number | null;
  used: number;
}

/**
 * 单个计费类型的额度（套餐感知，按 mode 区分展示）：
 * - window：编程套餐（滚动窗口制），展示各时段「已用 / 限额」；
 * - capped：固定额度套餐（token/image 设有 token_limit），展示「已用 / 限额 / 剩余」；
 * - balance：计量预付费（token/image 无 token_limit），展示 ledger「余额 / 预扣 / 可用」。
 */
export interface QuotaItem {
  billingPlan: string;
  /** 套餐名（如「Coding 尝鲜版」），无套餐时为 null */
  planName: string | null;
  /** 计费单位：requests（coding）/ tokens（token、image） */
  unit: 'requests' | 'tokens';
  mode: 'window' | 'capped' | 'balance';
  /** 计费模式（coding 派生）：metered/daily/weekly/monthly/quarterly/yearly/permanent */
  billingModel?: string;
  /** 总额度（coding=本周额度、token/image capped=token_limit），无则 null */
  total?: number | null;
  /** window 模式 */
  windows?: QuotaWindow[];
  /** capped 模式：套餐固定额度上限 */
  limit?: number;
  /** balance 模式：ledger 余额（已充 − 已用） */
  balance?: number;
  /** balance 模式：当前预扣（未结算） */
  reserved?: number;
  /** capped / balance 模式：累计已用 */
  used?: number;
  /** capped / balance 模式：可用 / 剩余 */
  available?: number;
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
