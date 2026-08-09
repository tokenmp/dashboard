import { useState } from 'react';
import dayjs from 'dayjs';
import { Activity, Percent } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getModelSuccessBucketsApi, type SuccessBucket } from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import type { AiModelItem } from '@/types/upstream';

type Range = '24h' | '1h' | '15m';

const RANGES: { value: Range; label: string }[] = [
  { value: '24h', label: '24 小时' },
  { value: '1h', label: '1 小时' },
  { value: '15m', label: '15 分钟' },
];

/**
 * 模型请求成功率时段柱状图（近 24h / 1h / 15min，各 12 个桶）。
 * 点击模型卡片成功率 badge 打开。
 */
export function ModelSuccessDialog({ model, open, onOpenChange }: {
  model: AiModelItem;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [range, setRange] = useState<Range>('24h');
  const { data, loading } = useAsync(
    () => (open ? getModelSuccessBucketsApi(model.id, range) : Promise.resolve<SuccessBucket[]>([])),
    [model.id, range, open],
  );

  const buckets: SuccessBucket[] = data ?? [];
  const sum = buckets.reduce((s, b) => ({ total: s.total + b.total, success: s.success + b.success }), { total: 0, success: 0 });
  const overall = sum.total > 0 ? Math.round((sum.success * 1000) / sum.total) / 10 : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {model.display_name || model.name}
            <span className="font-mono text-xs font-normal text-muted-foreground">{model.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  range === r.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
              <Activity className="h-3 w-3" />
              <span className="tabular-nums text-foreground">{sum.total}</span> 请求
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
              <Percent className="h-3 w-3" />
              <span className="tabular-nums text-foreground">{overall != null ? `${overall}%` : '—'}</span>
            </span>
          </div>
        </div>

        <div className="flex h-40 items-stretch gap-1">
          {loading ? (
            <div className="w-full self-center text-center text-xs text-muted-foreground">加载中…</div>
          ) : buckets.length === 0 ? (
            <div className="w-full self-center text-center text-xs text-muted-foreground">无数据</div>
          ) : (
            buckets.map((b) => {
              const rate = b.rate ?? 0;
              const color = b.rate == null
                ? 'bg-muted'
                : b.rate >= 90 ? 'bg-emerald-500'
                : b.rate >= 60 ? 'bg-amber-500' : 'bg-red-500';
              return (
                <div
                  key={b.bucket}
                  className="flex h-full flex-1 flex-col items-center justify-end"
                  title={`${dayjs(b.bucket).format('MM-DD HH:mm')}\n成功 ${b.success}/${b.total}${b.rate != null ? `（${b.rate}%）` : ''}`}
                >
                  <span className="mb-0.5 text-[9px] tabular-nums text-muted-foreground">{b.rate != null ? `${Math.round(b.rate)}%` : '—'}</span>
                  <div
                    className={`w-full rounded-t transition-all ${color} ${b.total > 0 ? 'group-hover:opacity-80' : ''}`}
                    style={{ height: `${b.total > 0 ? Math.max(4, rate) : 0}%` }}
                  />
                  <span className={`text-[9px] tabular-nums ${b.total > 0 ? 'text-muted-foreground/60' : 'text-muted-foreground/30'}`}>{b.total}</span>
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>{buckets[0] ? dayjs(buckets[0].bucket).format('MM-DD HH:mm') : ''}</span>
          <span>当前</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
