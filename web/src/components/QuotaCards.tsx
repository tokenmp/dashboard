import { useEffect, useState } from 'react';
import type { QuotaItem } from '@/types/dashboard';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCompact, formatNumber } from '@/utils/format';

const PLAN_LABEL: Record<string, string> = {
  coding: '编程套餐',
  token: 'Token 套餐',
  image: '图像套餐',
  free: '免费',
};

/** 计费模式（coding 派生）→ 展示标签 + 语气色 */
const BILLING_MODEL_META: Record<string, { label: string; cls: string }> = {
  metered:    { label: '按量计费', cls: 'border-sky-500/40 text-sky-600' },
  daily:      { label: '按天',     cls: 'border-emerald-500/40 text-emerald-600' },
  monthly:    { label: '包月',     cls: 'border-emerald-500/40 text-emerald-600' },
  quarterly:  { label: '包季',     cls: 'border-violet-500/40 text-violet-600' },
  yearly:     { label: '包年',     cls: 'border-violet-500/40 text-violet-600' },
  permanent:  { label: '永久',     cls: 'border-amber-500/50 text-amber-600' },
};

/** 每分钟走动的「当前时刻」，供重置倒计时刷新。 */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** 距目标时刻的剩余时长文案：3天2小时 / 5小时12分 / 8分 / 已到点 */
function formatCountdown(ms: number): string {
  if (ms <= 0) return '已到点';
  const totalMin = Math.floor(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}天${h}小时`;
  if (h > 0) return `${h}小时${m}分`;
  return m > 0 ? `${m}分` : '即将重置';
}

/** 重置时刻的绝对时间（MM-dd HH:mm，本地时区） */
function formatResetTime(iso: string): string {
  const dt = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/**
 * 单个计费类型的额度明细卡（window / capped / balance）。
 * 单独导出便于 panel 概览按「槽位」与占位卡混排；dashboard 与 panel 共用。
 */
export function QuotaCard({ q, className }: { q: QuotaItem; className?: string }) {
  const now = useNow();
  const name = q.planName || PLAN_LABEL[q.billingPlan] || q.billingPlan;
  return (
    <div className={cn('flex h-full flex-col rounded-lg border p-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          {q.billingModel && BILLING_MODEL_META[q.billingModel] && (
            <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px]', BILLING_MODEL_META[q.billingModel].cls)}>
              {BILLING_MODEL_META[q.billingModel].label}
            </Badge>
          )}
        </div>
        <Badge variant="outline">{q.unit === 'requests' ? '次' : 'tok'}</Badge>
      </div>

      {q.total != null && (
        <div className="mt-3 flex items-baseline justify-between border-b pb-3">
          <span className="text-xs text-muted-foreground">
            {q.mode === 'window' ? '本周总额度' : '总额度'}
          </span>
          <span className="text-xl font-semibold tabular-nums">{formatNumber(q.total)}</span>
        </div>
      )}

      {q.mode === 'window' && q.windows?.map((w) => {
        const used = w.used ?? 0;
        const limit = w.limit ?? null;
        const unlimited = limit === null;
        const remaining = !unlimited ? Math.max(0, (limit as number) - used) : 0;
        return (
          <div key={w.key} className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{w.label}</span>
            {unlimited ? (
              <span className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
                已用 <span className="font-medium text-foreground">{formatNumber(used)}</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">不限</Badge>
              </span>
            ) : (
              <span className="tabular-nums text-muted-foreground">
                已用 <span className="font-medium text-foreground">{formatNumber(used)}</span> / {formatNumber(limit as number)}
              </span>
            )}
          </div>
          {unlimited ? (
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-full rounded-full bg-primary/20" />
            </div>
          ) : (
            <>
              <UsageBar ratio={Math.min(1, used / (limit as number))} />
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                <span>剩余 {formatNumber(remaining)}</span>
                {w.resetAt && (
                  <span title={`重置于 ${formatResetTime(w.resetAt)}`}>
                    {w.key === 'h5' ? '恢复' : '重置'} · {formatCountdown(new Date(w.resetAt).getTime() - now)}
                    <span className="ml-1 text-muted-foreground/70">({formatResetTime(w.resetAt)})</span>
                  </span>
                )}
              </div>
            </>
          )}
          </div>
        );
      })}

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
            <div className="flex justify-between"><span>余额</span><span className="tabular-nums">{formatNumber(q.balance ?? 0)}</span></div>
            <div className="flex justify-between"><span>预扣中</span><span className="tabular-nums">{formatNumber(q.reserved ?? 0)}</span></div>
          </div>
        </>
      )}
    </div>
  );
}

/** 额度明细卡组：dashboard 侧整组渲染时使用（逐项映射为 QuotaCard）。
 *  列数随数量自适应：1 张占满整行、2 张两列、3 张起才用三列，避免单套餐被挤在 1/3 宽的窄格里。 */
export function QuotaCards({ items, className }: { items: QuotaItem[]; className?: string }) {
  if (items.length === 0) return null;
  const grid =
    items.length === 1 ? 'grid grid-cols-1 gap-4'
    : items.length === 2 ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
    : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';
  return (
    <div className={className ?? grid}>
      {items.map((q) => (
        <QuotaCard key={`${q.billingPlan}-${q.planName ?? ''}`} q={q} />
      ))}
    </div>
  );
}

function UsageBar({ ratio, className }: { ratio: number; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <div className={cn('mt-1 h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
