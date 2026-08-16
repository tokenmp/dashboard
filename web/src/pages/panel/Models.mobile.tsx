import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Copy, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { getPanelModelsApi, getPanelModelNamesApi } from '@/api/panel';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAsync } from '@/hooks/useAsync';
import { useUrlQueryState } from '@/hooks/useUrlQueryState';
import { DebouncedInput } from '@/components/DebouncedInput';
import { EmptyState } from '@/components/EmptyState';
import { MODEL_SERIES, findModelIcon, ModelIcon } from '@/components/ModelIcon';
import { CapabilityBadge } from '@/components/CapabilityBadge';
import { ModelSuccessDialog } from '@/components/ModelSuccessDialog';
import { ProviderMappingsDialog } from '@/components/ProviderMappingsDialog';
import { FilterChip, FilterChipRow, MobilePagination } from '@/components/mobile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact, formatNumber } from '@/utils/format';
import type { AiModelItem, UpstreamQuery } from '@/types/upstream';

/** 移动端模型卡：轻量列表卡（图标+名称+成功率/倍率徽标、上下文与输出、能力徽标、供应商映射入口）。 */
function ModelListCard({ model }: { model: AiModelItem }) {
  const [providersOpen, setProvidersOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const providers = model.providers ?? [];
  const maxEff = Math.max(1, ...providers.map((p) => p.effective_multiplier ?? 1));
  const maxOut = Math.max(0, ...providers.map((p) => p.max_tokens ?? 0));

  const rate = model.success_rate;
  const rateMeta =
    rate == null
      ? null
      : rate >= 90
        ? { cls: 'text-emerald-600', label: `${rate}%` }
        : rate >= 60
          ? { cls: 'text-amber-600', label: `${rate}%` }
          : { cls: 'text-red-600', label: `${rate}%` };

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ModelIcon id={model.name} displayName={model.display_name ?? undefined} size={28} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold">{model.display_name || model.name}</div>
            <div className="flex items-center gap-1">
              <span className="truncate font-mono text-[10.5px] text-muted-foreground">{model.name}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(model.name);
                  toast.success(`已复制模型 ID：${model.name}`);
                }}
                className="shrink-0 text-muted-foreground/50"
                title="复制模型 ID"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {rateMeta && (
            <button type="button" onClick={() => setSuccessOpen(true)} title="查看时段成功率">
              <Badge variant="outline" className="gap-1 text-[10px]">
                <span className={rateMeta.cls}>●</span>
                {rateMeta.label}
              </Badge>
            </button>
          )}
          {maxEff > 1 && (
            <button type="button" onClick={() => setProvidersOpen(true)} title="查看供应商扣费倍率">
              <Badge className="border-amber-300 bg-amber-100 text-[10px] text-amber-700">×{maxEff} 扣费</Badge>
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] leading-[1.45]">
        <div className="flex gap-1.5">
          <span className="text-muted-foreground">上下文</span>
          <span className="tabular-nums">{model.context_window_tokens ? formatCompact(model.context_window_tokens) : '—'}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-muted-foreground">最大输出</span>
          <span className="tabular-nums">{maxOut ? formatCompact(maxOut) : '—'}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-muted-foreground">24h 调用</span>
          <span className="tabular-nums">{formatCompact(model.request_count_24h)}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-muted-foreground">计费</span>
          <span>{model.billing_mode === 'free_global' ? '不计费' : '计费'}</span>
        </div>
      </div>

      {(model.capabilities ?? []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(model.capabilities ?? []).slice(0, 4).map((c) => (
            <CapabilityBadge key={c} capability={c} />
          ))}
          {(model.capabilities ?? []).length > 4 && (
            <span className="text-[10px] leading-5 text-muted-foreground">+{model.capabilities.length - 4}</span>
          )}
        </div>
      )}

      <button
        type="button"
        className="mt-2 flex w-full items-center justify-between border-t pt-2 text-[11px] font-medium text-muted-foreground active:text-foreground"
        onClick={() => setProvidersOpen(true)}
      >
        <span>供应商映射（{providers.length}）</span>
        <ChevronRight className="h-3 w-3" />
      </button>

      <ProviderMappingsDialog model={model} open={providersOpen} onOpenChange={setProvidersOpen} />
      <ModelSuccessDialog model={model} open={successOpen} onOpenChange={setSuccessOpen} />
    </div>
  );
}

/** 模型目录·移动端：移动专属轻量列表卡（不复用桌面 ModelCard），筛选=搜索 + 系列/计费 chips。 */
export function ModelsMobile() {
  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'q', key: 'keyword' },
    { name: 'billing', key: 'billingMode' },
    { name: 'series', key: 'series' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getPanelModelsApi, {
      initial: { size: 20, sort: 'created_at', ...urlInit } as UpstreamQuery,
    });

  const { data: names } = useAsync(getPanelModelNamesApi, []);

  const availableSeries = useMemo(() => {
    const set = new Set<string>();
    for (const n of names ?? []) {
      const s = findModelIcon(n.name)?.series;
      if (s) set.add(s);
    }
    return Array.from(set);
  }, [names]);

  // 与桌面端一致的前端重排：同系列相邻 → 系列间按最近创建 → 系列内按版本降序、创建时间降序
  const sorted = useMemo(() => {
    const versionScore = (name: string): number => {
      const nums = name.toLowerCase().match(/(\d+)/g);
      if (!nums || nums.length === 0) return 0;
      const major = parseInt(nums[0], 10);
      const minor = nums[1] ? parseInt(nums[1], 10) : 0;
      return major + minor / 100;
    };
    const withMeta = list.map((m) => ({
      m,
      series: findModelIcon(m.name)?.series ?? `~${m.name}`,
      version: versionScore(m.name),
    }));
    const groupLatest = new Map<string, string>();
    for (const x of withMeta) {
      const cur = groupLatest.get(x.series) ?? '';
      if (x.m.created_at > cur) groupLatest.set(x.series, x.m.created_at);
    }
    withMeta.sort((a, b) => {
      if (a.series !== b.series) {
        return (groupLatest.get(b.series) ?? '').localeCompare(groupLatest.get(a.series) ?? '');
      }
      if (a.version !== b.version) return b.version - a.version;
      return b.m.created_at.localeCompare(a.m.created_at);
    });
    return withMeta.map((x) => x.m);
  }, [list]);

  useEffect(() => { write(params); }, [params]);

  // 系列 chip 选项：与桌面 ModelSeriesSelect 一致，仅保留当前实际可用的系列
  const seriesOptions = useMemo(
    () => [
      { value: 'all', label: '全部系列' },
      ...MODEL_SERIES.filter((s) => availableSeries.includes(s.series)).map((s) => ({ value: s.series, label: s.label })),
    ],
    [availableSeries],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-sm font-bold">模型目录</h1>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">平台当前可用模型 · 共 {formatNumber(total)} 个</p>
        </div>
        <Button variant="outline" size="sm" className="h-[30px] shrink-0 rounded-lg px-2.5" onClick={reload} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />刷新
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <DebouncedInput
          className="h-8 rounded-lg px-2.5 pl-8 text-xs"
          placeholder="搜索 name / display_name"
          value={params.keyword ?? ''}
          onDebouncedChange={(value) => setFilters({ keyword: value })}
        />
      </div>

      <FilterChipRow className="px-0">
        <FilterChip
          label="系列"
          options={seriesOptions}
          value={params.series ?? 'all'}
          onChange={(value) => setFilters({ series: value === 'all' ? '' : value })}
        />
        <FilterChip
          label="计费"
          options={[
            { value: 'all', label: '全部' },
            { value: 'billable', label: '计费' },
            { value: 'free_global', label: '不计费' },
          ]}
          value={params.billingMode ?? 'all'}
          onChange={(value) => setFilters({ billingMode: value === 'all' ? '' : value })}
        />
      </FilterChipRow>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-2.5 text-[13px] text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading && list.length === 0 ? (
        <div className="space-y-[7px]">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}><CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-7 w-7 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <div className="mt-3 space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="mt-3 h-8 w-full" />
            </CardContent></Card>
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="暂无模型" description="尝试调整搜索或计费模式筛选" />
      ) : (
        <div className="space-y-[7px]">
          {sorted.map((model) => <ModelListCard key={model.id} model={model} />)}
        </div>
      )}

      {total > 0 && (
        <MobilePagination page={page} size={size} total={total} onPageChange={setPage} />
      )}
    </div>
  );
}
