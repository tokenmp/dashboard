import type { QuotaItem } from '@/types/dashboard';
import { Badge } from '@/components/ui/badge';
import { formatCompact, formatNumber } from '@/utils/format';

const PLAN_LABEL: Record<string, string> = {
  coding: '编程套餐',
  token: 'Token 套餐',
  image: '图像套餐',
  free: '免费',
};

/** 额度明细卡组：按套餐模式（window / capped / balance）渲染，dashboard 与 panel 共用。 */
export function QuotaCards({ items, className }: { items: QuotaItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <div className={className ?? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'}>
      {items.map((q) => {
        const name = q.planName || PLAN_LABEL[q.billingPlan] || q.billingPlan;
        return (
          <div key={q.billingPlan} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{name}</span>
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

            {q.mode === 'window' && q.windows?.map((w) => (
              <div key={w.key} className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{w.label}</span>
                  <span className="tabular-nums">
                    {formatNumber(w.used)}{w.limit ? ` / ${formatNumber(w.limit)}` : ' / 不限'}
                  </span>
                </div>
                {w.limit ? <UsageBar ratio={Math.min(1, w.used / w.limit)} /> : null}
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
                  <div className="flex justify-between"><span>余额</span><span className="tabular-nums">{formatNumber(q.balance ?? 0)}</span></div>
                  <div className="flex justify-between"><span>预扣中</span><span className="tabular-nums">{formatNumber(q.reserved ?? 0)}</span></div>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
