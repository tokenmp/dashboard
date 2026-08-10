import { Link, useNavigate } from 'react-router-dom';
import {
  RefreshCw,
  Activity,
  Zap,
  Gauge,
  CheckCircle2,
  Sparkles,
  Code2,
  Coins,
  Gift,
} from 'lucide-react';
import { getPanelOverviewApi } from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { StatCard } from '@/components/StatCard';
import { QuotaCard } from '@/components/QuotaCards';
import { TrendChart } from '@/components/TrendChart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact, formatNumber, formatPercent } from '@/utils/format';
import type { UserOverview, TrendPoint, QuotaItem } from '@/types/dashboard';

/** 概览页始终保证渲染的两个核心套餐槽位（编程 / Token） */
type CorePlanType = 'coding' | 'token';

const CORE_PLAN_META: Record<CorePlanType, { name: string; icon: typeof Code2; desc: string }> = {
  coding: {
    name: '编程套餐',
    icon: Code2,
    desc: '按周窗口计量请求次数，适合日常开发、Agent 与自动化调用。',
  },
  token: {
    name: 'Token 套餐',
    icon: Coins,
    desc: '按 Token 计量的通用额度，可跨模型使用，灵活不浪费。',
  },
};

/**
 * 用户面·概览：个人视角的今日 KPI、各计费类型额度（套餐感知）与 30 天趋势。
 * 始终是用户视角（panel 永远只取自己的数据）。
 */
function Overview() {
  const { data, loading, error, reload } = useAsync(getPanelOverviewApi);

  return (
    <div className="space-y-6">
      {/* 标题区 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">概览</h1>
          <Badge variant="secondary">用户</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading && !data ? (
        <OverviewSkeleton />
      ) : data ? (
        <OverviewView data={data} />
      ) : null}
    </div>
  );
}

function OverviewView({ data }: { data: UserOverview }) {
  const { kpi, quota, trend } = data;

  // 拆分：核心两个槽位（编程 / Token）+ 其余套餐（图像等，仅在有数据时追加）
  const codingItem = quota.find((q) => q.billingPlan === 'coding');
  const tokenItem = quota.find((q) => q.billingPlan === 'token');
  const otherItems = quota.filter((q) => q.billingPlan !== 'coding' && q.billingPlan !== 'token');
  const coreActive = [codingItem, tokenItem].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* 今日 KPI：恒为 4 张卡。
          套餐充足时显示前两个套餐摘要；不足时依次用「今日成功率」「已开通套餐」补齐，
          避免出现半空网格。 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="今日请求"
          value={formatNumber(kpi.todayRequests)}
          hint={`总请求 ${formatNumber(kpi.totalRequests)}`}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="今日 Token 消耗"
          value={formatCompact(kpi.todayTokens)}
          hint={`总消耗 ${formatCompact(kpi.totalTokens)}`}
          icon={<Zap className="h-4 w-4" />}
        />
        {quota.slice(0, 2).map((q) => (
          <QuotaStatCard key={q.billingPlan} q={q} />
        ))}
        {quota.length < 2 && (
          <StatCard
            label="今日成功率"
            value={formatPercent(kpi.todaySuccessRate)}
            hint="今日请求成功比例"
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
        )}
        {quota.length === 0 && (
          <StatCard
            label="已开通套餐"
            value={`${coreActive} / 2`}
            hint={
              <Link to="/panel/redemptions" className="text-primary hover:underline">
                去开通 →
              </Link>
            }
            icon={<Sparkles className="h-4 w-4" />}
          />
        )}
      </div>

      {/* 我的套餐：恒展示「编程 + Token」两个槽位，已开通渲染额度卡，未开通渲染占位 CTA 卡，
          确保无套餐 / 单套餐场景下界面充实且有明确下一步。 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">我的套餐</h2>
            <p className="text-xs text-muted-foreground">额度使用与开通情况</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/panel/redemptions">
              <Gift className="mr-1.5 h-4 w-4" />
              兑换码
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PlanSlot type="coding" item={codingItem} />
          <PlanSlot type="token" item={tokenItem} />
          {otherItems.map((q) => (
            <QuotaCard key={q.billingPlan} q={q} />
          ))}
        </div>
      </section>

      <TrendSection trend={trend} />
    </div>
  );
}

/* ----------------------------- 套餐槽位 ----------------------------- */

/** 单个核心套餐槽位：有数据渲染额度卡，无数据渲染占位 CTA 卡 */
function PlanSlot({ type, item }: { type: CorePlanType; item?: QuotaItem }) {
  if (item) return <QuotaCard q={item} />;
  return <EmptyPlanCard type={type} />;
}

/** 未开通套餐的占位卡：与额度卡等高，虚线边框 + 说明 + 开通 CTA */
function EmptyPlanCard({ type }: { type: CorePlanType }) {
  const navigate = useNavigate();
  const meta = CORE_PLAN_META[type];
  const Icon = meta.icon;
  return (
    <div className="flex h-full flex-col rounded-lg border border-dashed bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-background text-muted-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium text-muted-foreground">{meta.name}</span>
        </div>
        <Badge variant="outline" className="text-muted-foreground">
          未开通
        </Badge>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{meta.desc}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-auto w-full"
        onClick={() => navigate('/panel/redemptions')}
      >
        <Gift className="mr-1.5 h-4 w-4" />
        兑换码开通
      </Button>
    </div>
  );
}

/* ----------------------------- 额度卡片 ----------------------------- */

/** 顶部概览卡：每个计费类型一行精简摘要 */
function QuotaStatCard({ q }: { q: QuotaItem }) {
  const name = q.planName || planLabel(q.billingPlan);
  if (q.mode === 'window') {
    // 首个窗口为主额度（周期/月 或 周），次窗口作 hint
    const main = q.windows?.[0];
    const sub = q.windows?.[1];
    if (!main) {
      return <StatCard label={name} value="—" icon={<Gauge className="h-4 w-4" />} />;
    }
    const limit = main.limit;
    const capped = limit != null;
    const remaining = capped ? Math.max(0, limit - main.used) : 0;
    const subStr = sub
      ? `${sub.label} 已用 ${formatNumber(sub.used)}${sub.limit ? ` / ${formatNumber(sub.limit)}` : ' · 不限'}`
      : undefined;
    return (
      <StatCard
        label={`${name} · ${capped ? `${main.label}剩余` : main.label}`}
        value={capped ? formatNumber(remaining) : '不限'}
        hint={subStr}
        icon={<Gauge className="h-4 w-4" />}
      />
    );
  }
  // capped / balance：统一展示「可用」
  return (
    <StatCard
      label={`${name} 可用`}
      value={formatCompact(q.available ?? 0)}
      hint={
        q.mode === 'capped'
          ? `限额 ${formatCompact(q.limit ?? 0)} · 已用 ${formatCompact(q.used ?? 0)}`
          : `余额 ${formatCompact(q.balance ?? 0)}`
      }
      icon={<Gauge className="h-4 w-4" />}
    />
  );
}

/* ----------------------------- 趋势区 ----------------------------- */

function TrendSection({ trend }: { trend: TrendPoint[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">请求量（近 30 天）</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart data={trend} dataKey="requests" color="hsl(221.2 83.2% 53.3%)" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Token 消耗（近 30 天）</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart data={trend} dataKey="tokens" color="hsl(262.1 83.3% 57.8%)" />
        </CardContent>
      </Card>
    </div>
  );
}

/* ----------------------------- 辅助 ----------------------------- */

function planLabel(plan: string): string {
  return { coding: '编程套餐', token: 'Token 套餐', image: '图像套餐', free: '免费' }[plan] ?? plan;
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[140px] rounded-xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    </div>
  );
}

export default Overview;
