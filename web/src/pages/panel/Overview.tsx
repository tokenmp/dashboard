import type { ReactNode } from 'react';
import { RefreshCw, Activity, Zap, Gauge, CheckCircle2 } from 'lucide-react';
import { getPanelOverviewApi } from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { StatCard } from '@/components/StatCard';
import { TrendChart } from '@/components/TrendChart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact, formatNumber, formatPercent } from '@/utils/format';
import type { UserOverview, TrendPoint, QuotaItem } from '@/types/dashboard';

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
  return (
    <>
      {/* 今日 KPI + 各套餐概览 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="今日请求"
          value={formatNumber(kpi.todayRequests)}
          hint={`成功率 ${formatPercent(kpi.todaySuccessRate)}`}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="今日 Token 消耗"
          value={formatCompact(kpi.todayTokens)}
          hint={formatNumber(kpi.todayTokens)}
          icon={<Zap className="h-4 w-4" />}
        />
        {quota.slice(0, 2).map((q) => (
          <QuotaStatCard key={q.billingPlan} q={q} />
        ))}
      </div>

      {/* 额度明细：每个计费类型一张卡（按套餐类型区分展示） */}
      {quota.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">额度明细</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {quota.map((q) => (
                <QuotaDetail key={q.billingPlan} q={q} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <TrendSection trend={trend} extra={<SuccessNote rate={kpi.todaySuccessRate} />} />
    </>
  );
}

/* ----------------------------- 额度卡片 ----------------------------- */

/** 顶部概览卡：每个计费类型一行精简摘要 */
function QuotaStatCard({ q }: { q: QuotaItem }) {
  const name = q.planName || planLabel(q.billingPlan);
  if (q.mode === 'window') {
    const wk = q.windows?.find((w) => w.key === 'week');
    const h5 = q.windows?.find((w) => w.key === 'h5');
    return (
      <StatCard
        label={`${name} · 本周`}
        value={wk ? `${formatNumber(wk.used)}${wk.limit ? ` / ${formatNumber(wk.limit)}` : ''}` : '—'}
        hint={h5 ? `近 5 小时 ${formatNumber(h5.used)}${h5.limit ? ` / ${formatNumber(h5.limit)}` : ' / 不限'}` : undefined}
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

/** 额度明细卡：按套餐模式（window / capped / balance）分别渲染 */
function QuotaDetail({ q }: { q: QuotaItem }) {
  const name = q.planName || planLabel(q.billingPlan);
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{name}</span>
        <Badge variant="outline">{q.unit === 'requests' ? '次' : 'tok'}</Badge>
      </div>

      {/* 总额度头条 */}
      {q.total != null && (
        <div className="mt-3 flex items-baseline justify-between border-b pb-3">
          <span className="text-xs text-muted-foreground">{q.mode === 'window' ? '本周总额度' : '总额度'}</span>
          <span className="text-xl font-semibold tabular-nums">{formatNumber(q.total)}</span>
        </div>
      )}

      {q.mode === 'window' &&
        q.windows?.map((w) => (
          <div key={w.key} className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{w.label}</span>
              <span className="tabular-nums">
                {formatNumber(w.used)}
                {w.limit ? ` / ${formatNumber(w.limit)}` : ' / 不限'}
              </span>
            </div>
            {w.limit ? (
              <UsageBar ratio={Math.min(1, w.used / w.limit)} />
            ) : null}
          </div>
        ))}

      {q.mode === 'capped' && (
        <>
          <div className="mt-2 text-xl font-semibold tabular-nums">剩余 {formatCompact(q.available ?? 0)}</div>
          <UsageBar ratio={q.limit ? Math.min(1, (q.used ?? 0) / q.limit) : 0} className="mt-2" />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>已用 {formatNumber(q.used ?? 0)}</span>
            <span>限额 {formatNumber(q.limit ?? 0)}</span>
          </div>
        </>
      )}

      {q.mode === 'balance' && (
        <>
          <div className="mt-2 text-xl font-semibold tabular-nums">可用 {formatCompact(q.available ?? 0)}</div>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>余额</span>
              <span className="tabular-nums">{formatNumber(q.balance ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>预扣中</span>
              <span className="tabular-nums">{formatNumber(q.reserved ?? 0)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** 用量进度条：ratio = 已用 / 限额（0~1） */
function UsageBar({ ratio, className }: { ratio: number; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <div className={`mt-1 h-2 w-full overflow-hidden rounded-full bg-muted ${className ?? ''}`}>
      <div
        className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ----------------------------- 趋势区 ----------------------------- */

function TrendSection({ trend, extra }: { trend: TrendPoint[]; extra?: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">请求量（近 30 天）</CardTitle>
          {extra}
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

function SuccessNote({ rate }: { rate: number | null }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <CheckCircle2 className="h-3.5 w-3.5" />
      今日成功率 {formatPercent(rate)}
    </span>
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
