import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { ModelIcon } from '@/components/ModelIcon';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact, formatNumber } from '@/utils/format';
import type { ModelRankItem, ModelRankPeriod } from '@/types/usage';

const PERIOD_OPTIONS: { value: ModelRankPeriod; label: string }[] = [
  { value: 'today', label: '今日' },
  { value: '7d', label: '近 7 天' },
  { value: 'month', label: '本月' },
];

interface ModelRankCardProps {
  /** 拉取函数（panel=自身 / dashboard=全平台），period 变化时重新请求 */
  fetcher: (period: ModelRankPeriod) => Promise<ModelRankItem[]>;
  /** 卡片标题，默认「模型用量排行」 */
  title?: string;
}

/**
 * 模型调用排行卡：按实际调用次数降序的水平条形榜（count 请求日志，不含倍率），
 * token 消耗作为次要信息展示。时间口径由后端 DB 会话时区决定
 * （today / 7d 含今日 / 本月 1 日起）。
 */
export function ModelRankCard({ fetcher, title = '模型调用排行' }: ModelRankCardProps) {
  const [period, setPeriod] = useState<ModelRankPeriod>('today');
  const { data, loading, error, reload } = useAsync(() => fetcher(period), [period]);

  const items = data ?? [];
  const max = Math.max(1, ...items.map((i) => i.requests));
  const totalRequests = items.reduce((s, i) => s + i.requests, 0);
  const totalTokens = items.reduce((s, i) => s + i.tokens, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-baseline gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {items.length > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              合计 {formatNumber(totalRequests)} 次 · {formatCompact(totalTokens)} token
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as ModelRankPeriod)}>
            <SelectTrigger className="h-8 w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="py-6 text-sm text-destructive">{error}</p>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="暂无调用数据" className="border-0 py-8" />
        ) : (
          <div className="space-y-2">
            {items.map((m) => {
              const pct = (m.requests / max) * 100;
              return (
                <div
                  key={m.model}
                  className="flex items-center gap-3"
                  title={`${m.model}：${formatNumber(m.requests)} 次调用（成功 ${formatNumber(m.successes)}）· ${formatNumber(m.tokens)} token`}
                >
                  <span className="flex w-36 shrink-0 items-center gap-1.5 text-sm" title={m.model}>
                    <ModelIcon id={m.model} size={16} />
                    <span className="truncate">{m.model}</span>
                  </span>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className="flex h-full items-center justify-end rounded bg-foreground px-2"
                      style={{ width: `${Math.max(pct, 3)}%` }}
                    >
                      {pct > 18 && (
                        <span className="text-[10px] font-medium text-white">
                          {formatNumber(m.requests)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                    {formatNumber(m.requests)} 次
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
