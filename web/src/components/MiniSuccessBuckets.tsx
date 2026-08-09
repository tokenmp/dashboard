import { getModelSuccessBucketsApi } from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';

/**
 * 近 24h 成功率 mini 柱状图（12 桶），用于表格行。
 * 复用 success-buckets 接口（历史桶走缓存）。
 */
export function MiniSuccessBuckets({ modelId }: { modelId: string }) {
  const { data } = useAsync(() => getModelSuccessBucketsApi(modelId, '24h'), [modelId]);
  const buckets = data ?? [];
  if (buckets.length === 0) {
    return <span className="text-[10px] text-muted-foreground/40">—</span>;
  }
  return (
    <div className="flex h-7 w-full items-end gap-px" title="近 24h 成功率（每 2 小时一桶）">
      {buckets.map((b, i) => {
        const color = b.rate == null
          ? 'bg-muted'
          : b.rate >= 90 ? 'bg-emerald-500'
          : b.rate >= 60 ? 'bg-amber-500' : 'bg-red-500';
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm ${color}`}
            style={{ height: `${b.total > 0 ? Math.max(15, b.rate ?? 0) : 0}%` }}
          />
        );
      })}
    </div>
  );
}
