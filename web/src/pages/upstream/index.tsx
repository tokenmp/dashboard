import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Copy, Pencil, Plus, RefreshCw, Search, Settings2, Plug } from 'lucide-react';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useUrlQueryState } from '@/hooks/useUrlQueryState';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { ModelIcon, ModelSeriesSelect } from '@/components/ModelIcon';
import { CapabilityBadge } from '@/components/CapabilityBadge';
import { Sparkline } from '@/components/Sparkline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DebouncedInput } from '@/components/DebouncedInput';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCompact, formatNumber } from '@/utils/format';
import { billingLabel, billingVariant } from '@/utils/billing';
import { ProviderCreateDialog } from './ProviderCreateDialog';
import { ProviderEndpointsDialog } from './ProviderEndpointsDialog';
import { KeysTab } from './KeysTab';
import { ModelEditDialog } from './ModelEditDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { AiModelItem, UpstreamQuery } from '@/types/upstream';

const UPSTREAM_META: Record<string, { title: string; desc: string }> = {
  providers: { title: '供应商', desc: '供应商与端点' },
  keys: { title: '上游账号', desc: '上游密钥与账号管理' },
  routes: { title: '路由组', desc: '路由组与成员映射' },
  models: { title: '平台模型', desc: '平台模型目录与计费' },
};

function Upstream({ section }: { section: string }) {
  const meta = UPSTREAM_META[section] ?? UPSTREAM_META.providers;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{meta.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{meta.desc}</p>
      </div>
      {section === 'providers' && <ProvidersTab />}
      {section === 'keys' && <KeysTab />}
      {section === 'routes' && <RoutesTab />}
      {section === 'models' && <ModelsTab />}
    </div>
  );
}

/* ----------------------------- 分页工具条 ----------------------------- */
function Pager({ page, size, total, loading, setPage }: { page: number; size: number; total: number; loading: boolean; setPage: (p: number) => void }) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>第 {page} / {pages} 页 · 每页 {size} 条 · 共 {formatNumber(total)}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>上一页</Button>
        <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>下一页</Button>
      </div>
    </div>
  );
}

/* ----------------------------- 供应商 ----------------------------- */
function ProvidersTab() {
  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'q', key: 'keyword' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getProvidersApiLazy, { initial: { size: 20, sort: '-created_at', ...urlInit } as UpstreamQuery });
  useEffect(() => { write(params); }, [params]);
  const [createOpen, setCreateOpen] = useState(false);
  const [endpointsProvider, setEndpointsProvider] = useState<{ id: string; name?: string } | null>(null);
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex items-end gap-3 p-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">名称搜索</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <DebouncedInput className="pl-8" placeholder="搜索 name / display_name" value={params.keyword ?? ''} onDebouncedChange={(v) => setFilters({ keyword: v })} />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" />新增供应商</Button>
        </CardContent>
      </Card>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      <Card><CardContent className="p-0">
        {loading && list.length === 0 ? <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          : list.length === 0 ? <EmptyState className="mx-4 my-6" title="暂无供应商" />
          : <Table>
              <TableHeader><TableRow>
                <TableHead>名称</TableHead><TableHead className="w-[90px]">状态</TableHead>
                <TableHead>base_url</TableHead><TableHead className="w-[80px] text-right">端点</TableHead>
              </TableRow></TableHeader>
              <TableBody>{list.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.display_name || p.name}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="max-w-[300px] truncate font-mono text-xs text-muted-foreground">{p.base_url}</TableCell>
                  <TableCell className="text-right">
                    <button type="button" className="inline-flex items-center gap-1 rounded text-muted-foreground hover:text-foreground" onClick={() => setEndpointsProvider({ id: p.id, name: p.display_name || p.name })}>
                      <Plug className="h-3.5 w-3.5" />
                      <span className="tabular-nums text-xs">{p.endpoint_count}</span>
                    </button>
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>}
      </CardContent></Card>
      <Pager page={page} size={size} total={total} loading={loading} setPage={setPage} />
      <ProviderCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={reload} />
      <ProviderEndpointsDialog open={!!endpointsProvider} onOpenChange={(o) => !o && setEndpointsProvider(null)} providerId={endpointsProvider?.id ?? null} providerName={endpointsProvider?.name} />
    </div>
  );
}
// 延迟引用避免循环
import { getDashboardProvidersApi } from '@/api/dashboard';
const getProvidersApiLazy = (p: UpstreamQuery) => getDashboardProvidersApi(p);

/* ----------------------------- 路由组 ----------------------------- */
function RoutesTab() {
  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'q', key: 'keyword' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getRouteGroupsApiLazy, { initial: { size: 20, sort: 'created_at', ...urlInit } as UpstreamQuery });
  useEffect(() => { write(params); }, [params]);
  return (
    <div className="space-y-3">
      <Card><CardContent className="flex items-end gap-3 p-4">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">名称搜索</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <DebouncedInput className="pl-8" placeholder="搜索路由组名" value={params.keyword ?? ''} onDebouncedChange={(v) => setFilters({ keyword: v })} />
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
      </CardContent></Card>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      <Card><CardContent className="p-0">
        {loading && list.length === 0 ? <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          : list.length === 0 ? <EmptyState className="mx-4 my-6" title="暂无路由组" />
          : <Table>
              <TableHeader><TableRow>
                <TableHead>名称</TableHead><TableHead className="w-[90px]">系统组</TableHead>
                <TableHead className="w-[90px]">状态</TableHead><TableHead className="w-[100px] text-right">成员映射</TableHead>
              </TableRow></TableHeader>
              <TableBody>{list.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.display_name || g.name}</TableCell>
                  <TableCell>{g.is_system ? <Badge variant="default" className="text-[10px]">系统</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell><StatusBadge status={g.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{g.member_count}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>}
      </CardContent></Card>
      <Pager page={page} size={size} total={total} loading={loading} setPage={setPage} />
    </div>
  );
}
import { getDashboardRouteGroupsApi } from '@/api/dashboard';
const getRouteGroupsApiLazy = (p: UpstreamQuery) => getDashboardRouteGroupsApi(p);

/* ----------------------------- 平台模型 ----------------------------- */
function formatPrice(price: number | null): string {
  if (price == null) return '—';
  const perMillion = price * 1_000_000;
  return `¥${perMillion.toFixed(2)}/M`;
}

function ModelCard({ m, onEdit, onManageMappings }: { m: AiModelItem; onEdit: () => void; onManageMappings: () => void }) {
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [healthData, setHealthData] = useState<Record<string, number[]>>({});
  const [healthLoading, setHealthLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [pendingDisable, setPendingDisable] = useState<string | null>(null);
  const doToggle = async (mappingId: string, next: 'active' | 'disabled') => {
    setTogglingId(mappingId);
    try {
      await updateMappingStatusApi(mappingId, next);
      toast.success(next === 'active' ? '已启用' : '已禁用');
      window.dispatchEvent(new CustomEvent('mapping-refresh'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    } finally { setTogglingId(null); }
  };
  const toggleMapping = (mappingId: string, current: string) => {
    const next = current === 'active' ? 'disabled' : 'active';
    if (next === 'disabled') { setPendingDisable(mappingId); return; }
    doToggle(mappingId, 'active');
  };
  const providers = useMemo(() => m.providers ?? [], [m.providers]);
  const grouped = useMemo(() => {
    const map = new Map<string, { providerName: string; providerKey: string; keys: typeof providers }>();
    for (const p of providers) {
      const name = p.provider_display_name || p.provider_name;
      if (!map.has(p.provider_name)) {
        map.set(p.provider_name, { providerName: name, providerKey: p.provider_name, keys: [] });
      }
      map.get(p.provider_name)!.keys.push(p);
    }
    return Array.from(map.values());
  }, [providers]);

  useEffect(() => {
    if (!providerDialogOpen) return;

    let active = true;
    setHealthLoading(true);
    getModelKeyHealthApi(m.id)
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
  }, [providerDialogOpen, m.id]);

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <ModelIcon id={m.name} displayName={m.display_name ?? undefined} size={36} />
              <div className="min-w-0">
                <div className="truncate font-medium">{m.display_name || m.name}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">{m.name}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Badge variant={billingVariant(m.billing_mode)} className="text-[10px]">{billingLabel(m.billing_mode)}</Badge>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {m.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.description}</p>}
          <div className="mt-2 flex flex-wrap gap-1">
            {(m.capabilities ?? []).map((c) => <CapabilityBadge key={c} capability={c} />)}
          </div>
          <div className="mt-2 flex items-center gap-x-4 text-xs text-muted-foreground">
            <span>上下文：<span className="text-foreground">{m.context_window_tokens ? formatCompact(m.context_window_tokens) : '—'}</span></span>
            <span>最大输出：<span className="text-foreground">{(() => { const mo = Math.max(0, ...providers.map(p => p.max_tokens ?? 0)); return mo ? formatCompact(mo) : '—'; })()}</span></span>
          </div>
          <div className="mt-2 flex w-full items-center justify-between border-t pt-2 text-[11px] font-medium text-muted-foreground">
            <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => setProviderDialogOpen(true)}>
              <span>供应商映射（{providers.length}）</span>
              <ChevronRight className="h-3 w-3" />
            </button>
            <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={onManageMappings}>
              <Settings2 className="h-3 w-3" />
              <span>映射管理</span>
            </button>
          </div>
        </CardContent>
      </Card>
      <Dialog open={providerDialogOpen} onOpenChange={setProviderDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{m.display_name || m.name} · 供应商映射</DialogTitle>
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
                          {(() => { const eff = group.keys[0]?.effective_multiplier ?? 1; return eff !== 1 ? <Badge className="border-amber-400 bg-amber-100 text-[10px] text-amber-700">×{eff} 扣费</Badge> : null; })()}
                          <button
                            type="button"
                            onClick={() => {
                              const selector = `${m.name}@${group.providerKey}`;
                              navigator.clipboard.writeText(selector);
                              toast.success(`已复制选择器：${selector}`);
                            }}
                            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            title="复制选择器"
                          >
                            {m.name}@{group.providerKey}
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
                            className="flex items-center gap-3 rounded bg-muted/50 px-2 py-1.5"
                          >
                            <span className={`shrink-0 ${key.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>●</span>
                            <span className="flex w-44 shrink-0 items-center gap-1 truncate text-xs">
                              <span className="truncate font-medium text-foreground">{key.upstream_key_name}</span>
                              <span title={key.upstream_key_id} className="font-mono text-muted-foreground">{key.upstream_key_id.slice(-10)}</span>
                            </span>
                            <span className="w-28 shrink-0 truncate text-xs text-muted-foreground/70">{key.upstream_model_name && key.upstream_model_name !== m.name ? `→ ${key.upstream_model_name}` : ''}</span>
                            <span className="w-40 shrink-0 text-xs text-muted-foreground">
                              <span className="text-foreground">{key.max_tokens ? formatCompact(key.max_tokens) : '—'}</span> · {formatPrice(key.input_price_per_token)} / {formatPrice(key.output_price_per_token)}
                            </span>
                            <div className="ml-auto flex shrink-0 items-center gap-2">
                              {healthLoading ? (
                                <Skeleton className="h-5 w-20" />
                              ) : (
                                <Sparkline data={healthData[key.upstream_key_id] ?? []} width={80} height={20} />
                              )}
                              <button
                                type="button"
                                className={`rounded px-2 py-0.5 text-xs disabled:opacity-50 ${key.status === 'active' ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                                disabled={togglingId === key.mapping_id}
                                onClick={() => toggleMapping(key.mapping_id, key.status)}
                              >
                                {togglingId === key.mapping_id ? '…' : key.status === 'active' ? '禁用' : '启用'}
                              </button>
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
      <ConfirmDialog
        open={!!pendingDisable}
        onOpenChange={(o) => !o && setPendingDisable(null)}
        title="禁用映射"
        description="确认禁用该映射？禁用后该映射不再被调用。"
        confirmText="禁用"
        variant="destructive"
        onConfirm={() => { if (pendingDisable) doToggle(pendingDisable, 'disabled'); }}
      />
    </>
  );
}

function ModelsTab() {
  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'q', key: 'keyword' },
    { name: 'billing', key: 'billingMode' },
    { name: 'series', key: 'series' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getModelsApiLazy, { initial: { size: 20, sort: 'created_at', ...urlInit } as UpstreamQuery });
  useEffect(() => { write(params); }, [params]);
  const navigate = useNavigate();
  const [editModel, setEditModel] = useState<AiModelItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  // 监听映射刷新事件（新建映射后刷新列表）
  useEffect(() => {
    const handler = () => reload();
    window.addEventListener('mapping-refresh', handler);
    return () => window.removeEventListener('mapping-refresh', handler);
  }, [reload]);
  return (
    <div className="space-y-3">
      <Card><CardContent className="flex items-end gap-3 p-4">
        <div className="w-[160px]">
          <label className="mb-1 block text-xs text-muted-foreground">模型系列</label>
          <ModelSeriesSelect value={params.series ?? 'all'} onChange={(v) => setFilters({ series: v === 'all' ? '' : v })} />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">名称搜索</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <DebouncedInput className="pl-8" placeholder="搜索模型名" value={params.keyword ?? ''} onDebouncedChange={(v) => setFilters({ keyword: v })} />
          </div>
        </div>
        <div className="w-[140px]">
          <label className="mb-1 block text-xs text-muted-foreground">计费模式</label>
          <ModelBillingSelect value={params.billingMode ?? 'all'} onChange={(v) => setFilters({ billingMode: v === 'all' ? '' : v })} />
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
        <Button size="sm" onClick={() => { setEditModel(null); setEditOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />新建模型</Button>
      </CardContent></Card>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      {loading && list.length === 0 ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
        : list.length === 0 ? <EmptyState title="暂无模型" />
        : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((m) => (
              <ModelCard
                key={m.id}
                m={m}
                onEdit={() => { setEditModel(m); setEditOpen(true); }}
                onManageMappings={() => navigate(`/dashboard/upstream/models/${m.id}/mappings`, { state: { name: m.display_name || m.name } })}
              />
            ))}
          </div>}
      <Pager page={page} size={size} total={total} loading={loading} setPage={setPage} />
      <ModelEditDialog open={editOpen} onOpenChange={setEditOpen} model={editModel} onSaved={reload} />
    </div>
  );
}
import { getDashboardModelsApi, getModelKeyHealthApi, updateMappingStatusApi } from '@/api/dashboard';
import { toast } from 'sonner';
const getModelsApiLazy = (p: UpstreamQuery) => getDashboardModelsApi(p);

function ModelBillingSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default Upstream;
