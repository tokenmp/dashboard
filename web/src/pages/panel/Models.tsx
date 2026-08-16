import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Copy, HelpCircle, LayoutGrid, RefreshCw, Search, Table as TableIcon } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { getPanelModelsApi, getPanelModelNamesApi } from '@/api/panel';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAsync } from '@/hooks/useAsync';
import { useUrlQueryState } from '@/hooks/useUrlQueryState';
import { DebouncedInput } from '@/components/DebouncedInput';
import { EmptyState } from '@/components/EmptyState';
import { ModelIcon, ModelSeriesSelect, findModelIcon } from '@/components/ModelIcon';
import { ProviderLogo } from '@/components/ProviderLogo';
import { toast } from 'sonner';
import { ModelSuccessDialog } from '@/components/ModelSuccessDialog';
import { ProviderMappingsDialog } from '@/components/ProviderMappingsDialog';
import { MiniSuccessBuckets } from '@/components/MiniSuccessBuckets';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { DataTable } from '@/components/ui/data-table';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CapabilityBadge } from '@/components/CapabilityBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { useIsMobile } from '@/hooks/use-is-mobile';
import type { AiModelItem, UpstreamQuery } from '@/types/upstream';
import { ModelsMobile } from './Models.mobile';

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

/** 模型卡片：桌面卡片视图与移动端强制卡片视图共用。 */
export function ModelCard({ model }: { model: AiModelItem }) {
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const providers = useMemo(() => model.providers ?? [], [model.providers]);

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <ModelIcon id={model.name} displayName={model.display_name ?? undefined} size={36} />
              <div className="min-w-0">
                <div className="truncate font-medium">{model.display_name || model.name}</div>
                <div className="flex items-center gap-1">
                  <span className="truncate font-mono text-xs text-muted-foreground">{model.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(model.name);
                      toast.success(`已复制模型 ID：${model.name}`);
                    }}
                    className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
                    title="复制模型 ID"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
            {(() => {
              const r = model.success_rate;
              const { dot, label } = r == null
                ? { dot: 'text-muted-foreground', label: '无数据' }
                : r >= 90
                ? { dot: 'text-emerald-500', label: `${r}%` }
                : r >= 60
                ? { dot: 'text-amber-500', label: `${r}%` }
                : { dot: 'text-red-500', label: `${r}%` };
              return (
                <Badge variant="outline" className="shrink-0 cursor-pointer gap-1 text-[10px] hover:bg-accent" title="点击查看时段详情" onClick={() => setSuccessOpen(true)}>
                  <span className={dot}>●</span>
                  {label}
                </Badge>
              );
            })()}
            {(() => {
              const maxEff = Math.max(1, ...(model.providers ?? []).map((p) => p.effective_multiplier ?? 1));
              if (maxEff <= 1) return null;
              return (
                <button type="button" onClick={() => setProviderDialogOpen(true)} title="查看供应商扣费倍率">
                  <Badge className="gap-1 border-amber-300 bg-amber-100 text-[10px] text-amber-700 hover:bg-amber-200">×{maxEff} 扣费</Badge>
                </button>
              );
            })()}
            </div>
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
      <ProviderMappingsDialog model={model} open={providerDialogOpen} onOpenChange={setProviderDialogOpen} />
      <ModelSuccessDialog model={model} open={successOpen} onOpenChange={setSuccessOpen} />
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

/** 模型目录·桌面端：卡片/表格双视图切换。 */
function ModelsDesktop() {
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
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => (localStorage.getItem('panelModelsView') === 'table' ? 'table' : 'card'));
  const [providersModel, setProvidersModel] = useState<AiModelItem | null>(null);
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

  const columns = useMemo<ColumnDef<AiModelItem>[]>(() => [
    {
      id: 'model',
      accessorFn: (m) => m.display_name || m.name,
      meta: { className: 'w-[220px]' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="模型" />,
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className="flex items-center gap-2">
            <ModelIcon id={m.name} displayName={m.display_name ?? undefined} size={24} />
            <div className="min-w-0">
              <div className="truncate font-medium">{m.display_name || m.name}</div>
              <div className="flex items-center gap-1">
                <span className="truncate font-mono text-[10px] text-muted-foreground">{m.name}</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(m.name); toast.success(`已复制模型 ID：${m.name}`); }} className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground" title="复制模型 ID"><Copy className="h-3 w-3" /></button>
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'providers',
      meta: { className: 'w-[150px]' },
      header: () => <span className="text-xs font-medium text-muted-foreground">供应商</span>,
      cell: ({ row }) => {
        const ps = row.original.providers ?? [];
        // 按供应商去重（保留首个携带 logo 字段的映射）
        const uniq = new Map<string, typeof ps[number]>();
        for (const p of ps) {
          const name = p.provider_display_name || p.provider_name;
          if (!uniq.has(name)) uniq.set(name, p);
        }
        const items = Array.from(uniq.entries());
        if (items.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="-space-x-1 flex shrink-0">
              {items.slice(0, 3).map(([name, p]) => (
                <ProviderLogo
                  key={name}
                  provider={{ id: p.provider_id, name: p.provider_name, display_name: p.provider_display_name, logo_url: p.provider_logo_url, logo_svg: p.provider_logo_svg }}
                  size={16}
                  className="ring-1 ring-background"
                />
              ))}
            </span>
            <span className="truncate">
              {items.length <= 3
                ? items.map(([name]) => name).join('、 ')
                : <>{items[0][0]} 等 <span className="text-muted-foreground">{items.length} 个</span></>}
            </span>
          </div>
        );
      },
    },
    {
      id: 'mapping',
      accessorFn: (m) => (m.providers ?? []).length,
      meta: { className: 'w-[100px]' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="映射/供应商" />,
      cell: ({ row }) => {
        const ps = row.original.providers ?? [];
        const provNames = Array.from(new Set(ps.map((p) => p.provider_display_name || p.provider_name)));
        return <span className="text-xs text-muted-foreground">映射 <span className="text-foreground">{ps.length}</span> · 供应商 <span className="text-foreground">{provNames.length}</span></span>;
      },
    },
    {
      id: 'price',
      accessorFn: (m) => { const ins = (m.providers ?? []).map((p) => p.input_price_per_token).filter((v): v is number => v != null); return ins.length ? Math.min(...ins) : Infinity; },
      meta: { className: 'w-[150px]' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="输入/输出" />,
      cell: ({ row }) => {
        const ps = row.original.providers ?? [];
        const inPrice = Math.min(...ps.map((p) => p.input_price_per_token ?? Infinity));
        const outPrice = Math.min(...ps.map((p) => p.output_price_per_token ?? Infinity));
        return (
          <div className="text-xs text-muted-foreground">
            输入 <span className="text-foreground">{inPrice !== Infinity ? `¥${(inPrice * 1_000_000).toFixed(2)}/M` : '—'}</span>
            <div>输出 <span className="text-foreground">{outPrice !== Infinity ? `¥${(outPrice * 1_000_000).toFixed(2)}/M` : '—'}</span></div>
          </div>
        );
      },
    },
    {
      id: 'context',
      accessorFn: (m) => m.context_window_tokens ?? 0,
      meta: { className: 'w-[150px]' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="上下文/输出" />,
      cell: ({ row }) => {
        const m = row.original;
        const maxOut = Math.max(0, ...(m.providers ?? []).map((p) => p.max_tokens ?? 0));
        return (
          <div className="text-xs text-muted-foreground">
            上下文 <span className="text-foreground">{m.context_window_tokens ? formatCompact(m.context_window_tokens) : '—'}</span>
            <div>最大输出 <span className="text-foreground">{maxOut ? formatCompact(maxOut) : '—'}</span></div>
          </div>
        );
      },
    },
    {
      id: 'multiplier',
      accessorFn: (m) => Math.max(...(m.providers ?? []).map((p) => p.effective_multiplier ?? 1), 1),
      meta: { className: 'w-[100px]' },
      header: ({ column }) => <DataTableColumnHeader column={column} title={<span className="inline-flex items-center">倍率 <HelpCircle className="ml-0.5 h-3 w-3 text-muted-foreground/60" /></span>} />,
      cell: ({ row }) => {
        const ps = row.original.providers ?? [];
        const effMap = new Map<number, string[]>();
        for (const p of ps) {
          const e = p.effective_multiplier ?? 1;
          if (e > 1) {
            const name = p.provider_display_name || p.provider_name;
            if (!effMap.has(e)) effMap.set(e, []);
            if (!effMap.get(e)!.includes(name)) effMap.get(e)!.push(name);
          }
        }
        const effs = Array.from(effMap.keys()).sort((a, b) => a - b);
        return (
          <div className="text-xs">
            {effs.length > 0 ? effs.map((e) => (<span key={e} title={`供应商：${effMap.get(e)?.join('、 ')}`} className="mr-1 inline-block rounded bg-amber-100 px-1 font-medium text-amber-700">×{e}</span>)) : <span className="text-muted-foreground">—</span>}
          </div>
        );
      },
    },
    {
      id: 'success',
      accessorKey: 'success_rate',
      meta: { className: 'w-[110px]' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="成功率 24h" />,
      cell: ({ row }) => {
        const r = row.original.success_rate;
        return (
          <div className="text-right">
            <div className={r == null ? 'text-muted-foreground' : r >= 90 ? 'text-emerald-600' : r >= 60 ? 'text-amber-600' : 'text-red-600'}>{r == null ? '无数据' : `${r}%`}</div>
            <div className="text-[10px] text-muted-foreground">{formatNumber(row.original.request_count_24h ?? 0)} 次</div>
          </div>
        );
      },
    },
    {
      id: 'trend',
      meta: { className: 'w-[110px]' },
      header: () => <span className="text-xs font-medium text-muted-foreground">趋势</span>,
      cell: ({ row }) => <MiniSuccessBuckets modelId={row.original.id} />,
    },
  ], []);

  useEffect(() => { write(params); }, [params]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">模型目录</h1>
          <p className="mt-1 text-sm text-muted-foreground">平台当前可用模型 · 共 {formatNumber(total)} 个</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
            <Button size="sm" variant={viewMode === 'card' ? 'default' : 'ghost'} className="h-7 w-7 p-0" title="卡片视图" onClick={() => { setViewMode('card'); localStorage.setItem('panelModelsView', 'card'); }}><LayoutGrid className="h-4 w-4" /></Button>
            <Button size="sm" variant={viewMode === 'table' ? 'default' : 'ghost'} className="h-7 w-7 p-0" title="表格视图" onClick={() => { setViewMode('table'); localStorage.setItem('panelModelsView', 'table'); }}><TableIcon className="h-4 w-4" /></Button>
          </div>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
          </Button>
        </div>
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
        viewMode === 'table' ? (
          <Card><CardContent className="p-0">
            <Table>
              <TableBody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}><Skeleton className="h-10 w-full" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}><CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-lg" />
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
              <div className="mt-3 flex gap-1.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="mt-3 h-8 w-full" />
            </CardContent></Card>
          ))}
        </div>
        )
      ) : list.length === 0 ? (
        <EmptyState title="暂无模型" description="尝试调整搜索或计费模式筛选" />
      ) : viewMode === 'table' ? (
        <DataTable columns={columns} data={sorted} onRowClick={(m) => setProvidersModel(m)} />
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
      {providersModel && (
        <ProviderMappingsDialog model={providersModel} open={true} onOpenChange={(o) => !o && setProvidersModel(null)} />
      )}
    </div>
  );
}

/** 模型目录：按视口分发桌面/移动视图（移动端强制卡片视图）。 */
function Models() {
  const isMobile = useIsMobile();
  return isMobile ? <ModelsMobile /> : <ModelsDesktop />;
}

export default Models;
