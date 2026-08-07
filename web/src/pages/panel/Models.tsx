import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Copy, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getModelKeyHealthApi, getPanelModelsApi, getPanelModelNamesApi } from '@/api/panel';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAsync } from '@/hooks/useAsync';
import { useUrlQueryState } from '@/hooks/useUrlQueryState';
import { DebouncedInput } from '@/components/DebouncedInput';
import { EmptyState } from '@/components/EmptyState';
import { ModelIcon, ModelSeriesSelect, findModelIcon } from '@/components/ModelIcon';
import { Sparkline } from '@/components/Sparkline';
import { Badge } from '@/components/ui/badge';
import { CapabilityBadge } from '@/components/CapabilityBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact, formatNumber } from '@/utils/format';
import { billingLabel, billingVariant } from '@/utils/billing';
import type { AiModelItem, UpstreamQuery } from '@/types/upstream';

function formatPrice(price: number | null): string {
  if (price == null) return '—';
  return `¥${(price * 1_000_000).toFixed(2)}/M`;
}

function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <DebouncedInput
        className="pl-8"
        placeholder="搜索 name / display_name"
        value={value}
        onDebouncedChange={onChange}
      />
    </div>
  );
}

function ModelBillingSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">全部</SelectItem>
        <SelectItem value="billable">计费</SelectItem>
        <SelectItem value="free_global">不计费</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ModelCard({ model }: { model: AiModelItem }) {
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [healthData, setHealthData] = useState<Record<string, number[]>>({});
  const [healthLoading, setHealthLoading] = useState(false);
  const providers = useMemo(() => model.providers ?? [], [model.providers]);
  const grouped = useMemo(() => {
    const map = new Map<string, { providerName: string; providerKey: string; keys: typeof providers }>();
    for (const provider of providers) {
      const name = provider.provider_display_name || provider.provider_name;
      if (!map.has(provider.provider_name)) {
        map.set(provider.provider_name, { providerName: name, providerKey: provider.provider_name, keys: [] });
      }
      map.get(provider.provider_name)!.keys.push(provider);
    }
    return Array.from(map.values());
  }, [providers]);

  useEffect(() => {
    if (!providerDialogOpen) return;

    let active = true;
    setHealthLoading(true);
    getModelKeyHealthApi(model.id)
      .then((data) => {
        if (!active) return;
        const map: Record<string, number[]> = {};
        for (const item of data) {
          map[item.upstream_key_id] = item.series.map((point) => point.success);
        }
        setHealthData(map);
      })
      .catch(() => {
        if (active) setHealthData({});
      })
      .finally(() => {
        if (active) setHealthLoading(false);
      });

    return () => { active = false; };
  }, [providerDialogOpen, model.id]);

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <ModelIcon id={model.name} displayName={model.display_name ?? undefined} size={36} />
              <div className="min-w-0">
                <div className="truncate font-medium">{model.display_name || model.name}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">{model.name}</div>
              </div>
            </div>
            <Badge
              variant={billingVariant(model.billing_mode)}
              className="shrink-0 text-[10px]"
            >
              {billingLabel(model.billing_mode)}
            </Badge>
          </div>
          {model.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{model.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {(model.capabilities ?? []).map((capability) => (
              <CapabilityBadge key={capability} capability={capability} />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-x-4 text-xs text-muted-foreground">
            <span>上下文：<span className="text-foreground">{model.context_window_tokens ? formatCompact(model.context_window_tokens) : '—'}</span></span>
            <span>最大输出：<span className="text-foreground">{(() => { const mo = Math.max(0, ...(model.providers ?? []).map(p => p.max_tokens ?? 0)); return mo ? formatCompact(mo) : '—'; })()}</span></span>
          </div>
          <button
            type="button"
            className="mt-2 flex w-full items-center justify-between border-t pt-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setProviderDialogOpen(true)}
          >
            <span>供应商映射（{providers.length}）</span>
            <ChevronRight className="h-3 w-3" />
          </button>
        </CardContent>
      </Card>
      <Dialog open={providerDialogOpen} onOpenChange={setProviderDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{model.display_name || model.name} · 供应商映射</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {providers.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">暂无可用供应商</div>
            ) : (
              <div className="space-y-3">
                {grouped.map((group) => {
                  const activeCount = group.keys.filter((key) => key.status === 'active').length;
                  const totalCount = group.keys.length;
                  const allActive = activeCount === totalCount;
                  const maxTokens = Math.max(...group.keys.map((key) => key.max_tokens ?? 0));
                  const inputPrices = group.keys
                    .map((key) => key.input_price_per_token)
                    .filter((value): value is number => value != null);
                  const outputPrices = group.keys
                    .map((key) => key.output_price_per_token)
                    .filter((value): value is number => value != null);
                  const inputPrice = inputPrices.length ? Math.min(...inputPrices) : null;
                  const outputPrice = outputPrices.length ? Math.min(...outputPrices) : null;

                  return (
                    <div key={group.providerName} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{group.providerName}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const selector = `${model.name}@${group.providerKey}`;
                              navigator.clipboard.writeText(selector);
                              toast.success(`已复制选择器：${selector}`);
                            }}
                            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            title="复制选择器"
                          >
                            {model.name}@{group.providerKey}
                            <Copy className="h-2.5 w-2.5" />
                          </button>
                        </div>
                        <Badge
                          variant={allActive ? 'secondary' : 'destructive'}
                          className="text-[10px]"
                        >
                          {totalCount} 个 Key · {allActive ? '全部可用' : `${activeCount}/${totalCount} 可用`}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>最大输出：<span className="text-foreground">{maxTokens ? formatCompact(maxTokens) : '—'}</span></span>
                        <span>输入价格：<span className="text-foreground">{formatPrice(inputPrice)}</span></span>
                        <span>输出价格：<span className="text-foreground">{formatPrice(outputPrice)}</span></span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {group.keys.map((key) => (
                          <div
                            key={key.mapping_id}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded bg-muted/50 px-2 py-1"
                          >
                            <span className={key.status === 'active' ? 'text-green-600' : 'text-red-600'}>●</span>
                            <span
                              title={key.upstream_key_id}
                              className="font-mono text-[10px] text-muted-foreground"
                            >
                              {key.upstream_key_id.slice(-10)}
                            </span>
                            {key.upstream_model_name && key.upstream_model_name !== model.name && (
                              <span className="truncate text-[10px] text-muted-foreground/70">→ {key.upstream_model_name}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              <span className="text-foreground">{key.max_tokens ? formatCompact(key.max_tokens) : '—'}</span> · {formatPrice(key.input_price_per_token)} / {formatPrice(key.output_price_per_token)}
                            </span>
                            <div className="ml-auto shrink-0">
                              {healthLoading ? (
                                <Skeleton className="h-5 w-20" />
                              ) : (
                                <Sparkline data={healthData[key.upstream_key_id] ?? []} width={80} height={20} />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModelPagination({
  page,
  size,
  total,
  loading,
  onPageChange,
}: {
  page: number;
  size: number;
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / size));

  return (
    <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <span>第 {page} / {pages} 页 · 每页 {size} 条 · 共 {formatNumber(total)} 条</span>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(page - 1)}
            >
              上一页
            </Button>
          </PaginationItem>
          <PaginationItem>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages || loading}
              onClick={() => onPageChange(page + 1)}
            >
              下一页
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

function Models() {
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

  // 前端重排：同系列相邻 → 系列间按最近创建 → 系列内按版本降序、创建时间降序
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">模型目录</h1>
          <p className="mt-1 text-sm text-muted-foreground">平台当前可用模型 · 共 {formatNumber(total)} 个</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-[160px]">
            <label className="mb-1 block text-xs text-muted-foreground">模型系列</label>
            <ModelSeriesSelect
              value={params.series ?? 'all'}
              onChange={(value) => setFilters({ series: value === 'all' ? '' : value })}
              available={availableSeries}
            />
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">名称搜索</label>
            <SearchInput
              value={params.keyword ?? ''}
              onChange={(value) => setFilters({ keyword: value })}
            />
          </div>
          <div className="w-[160px]">
            <label className="mb-1 block text-xs text-muted-foreground">计费模式</label>
            <ModelBillingSelect
              value={params.billingMode ?? 'all'}
              onChange={(value) => setFilters({ billingMode: value === 'all' ? '' : value })}
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading && list.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-52" />)}
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="暂无模型" description="尝试调整搜索或计费模式筛选" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((model) => <ModelCard key={model.id} model={model} />)}
        </div>
      )}

      <ModelPagination
        page={page}
        size={size}
        total={total}
        loading={loading}
        onPageChange={setPage}
      />
    </div>
  );
}

export default Models;
