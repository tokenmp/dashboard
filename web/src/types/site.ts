/**
 * 站点公开数据（site）—— landing 页游客可见的模型广场 / 套餐目录 / 站点统计
 *
 * 与后端 app/controller/site/Site.php 一一对应（无需登录）。
 */

export interface SiteModelProvider {
  id: string;
  name: string;
  /** 有效 Logo 地址：后台配置的外链或 /api/v1/site/providers/:id/logo；null 时前端回退内置品牌图标 */
  logo: string | null;
}

export interface SiteModel {
  id: string;
  name: string;
  display_name: string | null;
  /** 主供应商名（多供应商时取名称序最小者，口径同 /v1/models 的 owned_by） */
  owned_by: string;
  capabilities: string[];
  context_window: number;
  max_tokens: number;
  billing_mode: string;
  /** 当前时刻的用户侧组合倍率；多供应商时展示最优（最小）值 */
  multiplier: number;
  providers: SiteModelProvider[];
}

export interface SitePlan {
  id: string;
  name: string;
  plan_type: string;
  price: number;
  rolling_5h_limit: number | null;
  weekly_limit: number | null;
  cycle_limit: number | null;
  total_limit: number | null;
  token_limit: number | null;
  default_duration_days: number | null;
  /** 后台配置的分类标签（展示用，如 month/daily/permanent） */
  category: string | null;
}

export interface SiteOverview {
  models: number;
  providers: number;
  min_multiplier: number | null;
}
