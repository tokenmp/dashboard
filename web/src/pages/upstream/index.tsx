import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useUrlQueryState } from '@/hooks/useUrlQueryState';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DebouncedInput } from '@/components/DebouncedInput';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCompact, formatNumber } from '@/utils/format';
import { KeysTab } from './KeysTab';
import type { AiModelItem, UpstreamQuery } from '@/types/upstream';

function Upstream() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'keys';
  const switchTab = (t: string) => {
    const next = new URLSearchParams();
    if (t !== 'keys') next.set('tab', t);
    setSp(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">上游与模型</h1>
        <p className="mt-1 text-sm text-muted-foreground">供应商、上游 Key、路由组与平台模型目录</p>
      </div>
      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList>
          <TabsTrigger value="keys">上游 Key</TabsTrigger>
          <TabsTrigger value="providers">供应商</TabsTrigger>
          <TabsTrigger value="routes">路由组</TabsTrigger>
          <TabsTrigger value="models">平台模型</TabsTrigger>
        </TabsList>
        <TabsContent value="keys"><KeysTab /></TabsContent>
        <TabsContent value="providers"><ProvidersTab /></TabsContent>
        <TabsContent value="routes"><RoutesTab /></TabsContent>
        <TabsContent value="models"><ModelsTab /></TabsContent>
      </Tabs>
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
                <TableHead className="w-[80px] text-right">Key</TableHead>
              </TableRow></TableHeader>
              <TableBody>{list.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.display_name || p.name}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="max-w-[300px] truncate font-mono text-xs text-muted-foreground">{p.base_url}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.endpoint_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.key_count}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>}
      </CardContent></Card>
      <Pager page={page} size={size} total={total} loading={loading} setPage={setPage} />
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

function ModelCard({ m }: { m: AiModelItem }) {
  const [expanded, setExpanded] = useState(false);
  const providers = m.providers ?? [];
  const visibleProviders = expanded ? providers : providers.slice(0, 5);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-medium">{m.display_name || m.name}</div>
            <div className="font-mono text-xs text-muted-foreground">{m.name}</div>
          </div>
          <Badge variant={m.billing_mode === 'free_global' ? 'secondary' : 'default'} className="text-[10px]">{m.billing_mode}</Badge>
        </div>
        {m.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.description}</p>}
        <div className="mt-2 flex flex-wrap gap-1">
          {(m.capabilities ?? []).map((c) => <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>)}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">上下文窗口：{m.context_window_tokens ? formatCompact(m.context_window_tokens) : '—'}</div>
        <div className="mt-2 border-t pt-2">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">供应商映射（{providers.length}）</div>
          {providers.length === 0 ? (
            <div className="text-xs text-muted-foreground">暂无可用供应商</div>
          ) : (
            <div className="space-y-1">
              {visibleProviders.map((p) => (
                <div key={p.mapping_id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                  <span className="font-medium">{p.provider_display_name || p.provider_name}</span>
                  <span className="text-muted-foreground">{p.upstream_key_name}</span>
                  {p.upstream_model_name && p.upstream_model_name !== m.name && (
                    <span className="font-mono text-muted-foreground">→ {p.upstream_model_name}</span>
                  )}
                  <span className="text-muted-foreground">max: {p.max_tokens != null ? formatCompact(p.max_tokens) : '—'}</span>
                  <span className="text-muted-foreground">in: {formatPrice(p.input_price_per_token)}</span>
                  <span className="text-muted-foreground">out: {formatPrice(p.output_price_per_token)}</span>
                </div>
              ))}
              {providers.length > 5 && (
                <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setExpanded((value) => !value)}>
                  {expanded ? '收起' : `还有 ${providers.length - 5} 个`}
                </button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ModelsTab() {
  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'q', key: 'keyword' },
    { name: 'billing', key: 'billingMode' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getModelsApiLazy, { initial: { size: 20, sort: 'created_at', ...urlInit } as UpstreamQuery });
  useEffect(() => { write(params); }, [params]);
  return (
    <div className="space-y-3">
      <Card><CardContent className="flex items-end gap-3 p-4">
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
      </CardContent></Card>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      {loading && list.length === 0 ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
        : list.length === 0 ? <EmptyState title="暂无模型" />
        : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((m) => <ModelCard key={m.id} m={m} />)}
          </div>}
      <Pager page={page} size={size} total={total} loading={loading} setPage={setPage} />
    </div>
  );
}
import { getDashboardModelsApi } from '@/api/dashboard';
const getModelsApiLazy = (p: UpstreamQuery) => getDashboardModelsApi(p);

function ModelBillingSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">全部</SelectItem>
        <SelectItem value="billable">billable</SelectItem>
        <SelectItem value="free_global">free_global</SelectItem>
      </SelectContent>
    </Select>
  );
}
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default Upstream;
