import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Search, Plus, Zap, Trash2 } from 'lucide-react';
import { getDashboardUpstreamKeysApi, getDashboardUpstreamKeyDetailApi, probeUpstreamKeyApi, updateUpstreamKeyStatusApi, deleteUpstreamKeyApi } from '@/api/dashboard';
import { CreateKeyDialog } from './CreateKeyDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAsync } from '@/hooks/useAsync';
import { useRole } from '@/hooks/useRole';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DebouncedInput } from '@/components/DebouncedInput';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatCompact, formatDate, formatDateTime, formatNumber } from '@/utils/format';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import type { UpstreamKeyItem, UpstreamModelMappingItem, UpstreamQuery } from '@/types/upstream';

const MARKET_STATUSES = ['online', 'offline', 'paused', 'degraded', 'exhausted', 'suspended'];

export function KeysTab({ providerId }: { providerId?: string }) {
  const { isAdmin } = useRole();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [probingId, setProbingId] = useState<string | null>(null);
  const probeRow = async (id: string, name: string) => {
    setProbingId(id);
    try {
      const r = await probeUpstreamKeyApi(id);
      if (r.status === 'success') {
        toast.success(`「${name}」探测成功`, { description: `延迟 ${r.latency_ms}ms` });
      } else {
        toast.error(`「${name}」探测失败`, { description: [r.http_status ? `HTTP ${r.http_status}` : '', r.error_message].filter(Boolean).join(' · ') || '未知错误' });
      }
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '探测失败');
    } finally { setProbingId(null); }
  };
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const deleteRow = (id: string, name: string) => setPendingDelete({ id, name });
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteUpstreamKeyApi(pendingDelete.id);
      toast.success(`已删除「${pendingDelete.name}」`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getDashboardUpstreamKeysApi, { initial: { size: 20, sort: '-created_at', status: 'active', ...(providerId ? { providerId } : {}) } as UpstreamQuery });

  const columns = useMemo<ColumnDef<UpstreamKeyItem>[]>(() => {
    const cols: ColumnDef<UpstreamKeyItem>[] = [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="名称" />,
        cell: ({ row }) => {
          const k = row.original;
          return (
            <div>
              <div className="font-medium">{k.name}</div>
              <div className="font-mono text-xs text-muted-foreground">{k.key_prefix ?? ''}…{k.key_suffix ?? ''}</div>
            </div>
          );
        },
      },
    ];
    if (!providerId) {
      cols.push({
        id: 'provider',
        accessorFn: (k) => k.provider?.display_name || k.provider?.name || '',
        meta: { className: 'w-[110px]' },
        header: ({ column }) => <DataTableColumnHeader column={column} title="供应商" />,
        cell: ({ row }) => <span className="text-xs">{row.original.provider?.display_name || row.original.provider?.name || '—'}</span>,
      });
    }
    cols.push(
      { id: 'source_type', meta: { className: 'w-[90px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">来源</span>, cell: ({ row }) => <Badge variant={row.original.source_type === 'user' ? 'secondary' : 'outline'} className="text-[10px]">{row.original.source_type}</Badge> },
      { id: 'market_status', meta: { className: 'w-[100px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">市场状态</span>, cell: ({ row }) => <StatusBadge status={row.original.market_status} /> },
      { id: 'review_status', meta: { className: 'w-[80px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">审核</span>, cell: ({ row }) => <StatusBadge status={row.original.review_status} /> },
      {
        id: 'quota',
        meta: { className: 'w-[100px] text-right' },
        header: () => <span className="text-xs font-medium text-muted-foreground">用量</span>,
        cell: ({ row }) => <UsageBar used={Number(row.original.quota_used) || 0} total={row.original.quota_total} />,
      },
      {
        id: 'total_attempts',
        accessorFn: (k) => Number(k.total_attempts) || 0,
        meta: { className: 'w-[90px] text-right' },
        header: ({ column }) => <DataTableColumnHeader column={column} title="总调用" />,
        cell: ({ row }) => {
          const k = row.original;
          return (
            <div className="text-right text-xs tabular-nums">
              <div className="font-medium text-foreground">{formatNumber(Number(k.total_attempts) || 0)}</div>
              <div className="text-[10px] text-emerald-600">成功 {formatNumber(Number(k.total_success_attempts) || 0)}</div>
            </div>
          );
        },
      },
      {
        id: 'action',
        meta: { className: 'w-[100px] text-right' },
        header: () => null,
        cell: ({ row }) => {
          const k = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" title="测试" disabled={probingId === k.id} onClick={(e) => { e.stopPropagation(); probeRow(k.id, k.name); }}>
                <Zap className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" title="删除" onClick={(e) => { e.stopPropagation(); deleteRow(k.id, k.name); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        },
      },
    );
    return cols;
  }, [providerId, probingId, probeRow, deleteRow]);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs text-muted-foreground">名称搜索</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <DebouncedInput className="pl-8" placeholder="搜索 Key 名称" value={params.keyword ?? ''} onDebouncedChange={(v) => setFilters({ keyword: v })} />
            </div>
          </div>
          {isAdmin && (
            <div className="w-[140px]">
              <label className="mb-1 block text-xs text-muted-foreground">来源</label>
              <Select value={params.sourceType ?? 'all'} onValueChange={(v) => setFilters({ sourceType: v === 'all' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="platform">platform</SelectItem>
                  <SelectItem value="user">user</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="w-[140px]">
            <label className="mb-1 block text-xs text-muted-foreground">状态</label>
            <Select value={params.status ?? 'all'} onValueChange={(v) => setFilters({ status: v === 'all' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="disabled">disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-[140px]">
            <label className="mb-1 block text-xs text-muted-foreground">市场状态</label>
            <Select value={params.marketStatus ?? 'all'} onValueChange={(v) => setFilters({ marketStatus: v === 'all' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {MARKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
          {isAdmin && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" />新建账号</Button>}
        </CardContent>
      </Card>

      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      {loading && list.length === 0 ? (
        <Card><CardContent className="p-0"><div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div></CardContent></Card>
      ) : (
        <DataTable
          columns={columns}
          data={list}
          onRowClick={(k) => setDetailId(k.id)}
          emptyComponent={<EmptyState className="mx-4 my-6" title="暂无上游 Key" description={isAdmin ? undefined : '你还没有自有的上游 Key'} />}
        />
      )}

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>第 {page} / {Math.max(1, Math.ceil(total / size))} 页 · 每页 {size} 条 · 共 {formatNumber(total)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / size) || loading} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      )}

      {isAdmin && <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} providerId={providerId ?? null} onCreated={reload} />}
      <KeyDetailDrawer id={detailId} onClose={() => setDetailId(null)} onProbed={reload} />
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="删除账号"
        description={pendingDelete ? `确认删除账号「${pendingDelete.name}」？删除后不可恢复。` : ''}
        confirmText="删除"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function UsageBar({ used, total }: { used: number; total: number | null }) {
  if (total === null || total === 0) {
    return <span className="tabular-nums text-xs text-muted-foreground">{formatCompact(used)}</span>;
  }
  const pct = Math.min(100, Math.round((used / total) * 100));
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tabular-nums text-xs">{formatCompact(used)}/{formatCompact(total)}</span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${pct > 90 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function KeyDetailDrawer({ id, onClose, onProbed }: { id: string | null; onClose: () => void; onProbed?: () => void }) {
  const { data, loading, error, reload } = useAsync(
    () => (id ? getDashboardUpstreamKeyDetailApi(id) : Promise.resolve(null)),
    [id],
  );
  const [probing, setProbing] = useState(false);
  const [probeMsg, setProbeMsg] = useState('');
  const onProbe = async () => {
    if (!id) return;
    setProbing(true); setProbeMsg('');
    try {
      const r = await probeUpstreamKeyApi(id);
      setProbeMsg(r.status === 'success'
        ? `探测成功 · ${r.latency_ms}ms`
        : `探测失败 · ${r.http_status ?? ''} ${r.error_message}`.trim());
      reload();
      onProbed?.();
    } catch (e) {
      setProbeMsg(e instanceof Error ? e.message : '探测失败');
    } finally { setProbing(false); }
  };
  const [pendingDisable, setPendingDisable] = useState(false);
  const doToggle = async (next: 'active' | 'disabled') => {
    if (!id) return;
    try {
      await updateUpstreamKeyStatusApi(id, next);
      reload();
      onProbed?.();
    } catch (e) {
      setProbeMsg(e instanceof Error ? e.message : '操作失败');
    }
  };
  const onToggleStatus = () => {
    if (!id || !data) return;
    const next = data.key.status === 'active' ? 'disabled' : 'active';
    if (next === 'disabled') { setPendingDisable(true); return; }
    doToggle('active');
  };
  const mappingColumns = useMemo<ColumnDef<UpstreamModelMappingItem>[]>(() => [
    {
      id: 'model',
      header: () => <span className="text-xs font-medium text-muted-foreground">模型</span>,
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div>
            <div className="font-medium">{m.model?.name ?? '—'}</div>
            <div className="text-xs text-muted-foreground">{m.upstream_model_name ?? ''}</div>
          </div>
        );
      },
    },
    { id: 'endpoint', meta: { className: 'w-[120px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">端点</span>, cell: ({ row }) => <span className="text-xs">{row.original.providerEndpoint ? `${row.original.providerEndpoint.protocol}` : '—'}</span> },
    { id: 'context', meta: { className: 'w-[90px] text-right' }, header: () => <span className="text-xs font-medium text-muted-foreground">上下文</span>, cell: ({ row }) => <span className="block text-right tabular-nums text-xs">{row.original.model?.context_window_tokens ? formatCompact(row.original.model.context_window_tokens) : '—'}</span> },
    { id: 'max_tokens', meta: { className: 'w-[90px] text-right' }, header: () => <span className="text-xs font-medium text-muted-foreground">最大输出</span>, cell: ({ row }) => <span className="block text-right tabular-nums text-xs">{row.original.max_tokens ? formatCompact(row.original.max_tokens) : '—'}</span> },
    { id: 'input_price', meta: { className: 'w-[100px] text-right' }, header: () => <span className="text-xs font-medium text-muted-foreground">输入价</span>, cell: ({ row }) => <span className="block text-right tabular-nums text-xs">{row.original.input_price_per_token ?? '—'}</span> },
    { id: 'output_price', meta: { className: 'w-[100px] text-right' }, header: () => <span className="text-xs font-medium text-muted-foreground">输出价</span>, cell: ({ row }) => <span className="block text-right tabular-nums text-xs">{row.original.output_price_per_token ?? '—'}</span> },
  ], []);
  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>上游 Key 详情</SheetTitle>
            {id !== null && data && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={onProbe} disabled={probing}><Zap className="mr-1.5 h-4 w-4" />{probing ? '测试中…' : '测试'}</Button>
                <Button size="sm" variant={data.key.status === 'active' ? 'destructive' : 'default'} onClick={onToggleStatus}>{data.key.status === 'active' ? '禁用' : '启用'}</Button>
              </div>
            )}
          </div>
        </SheetHeader>
        {probeMsg && <div className={`px-4 py-2 text-sm ${probeMsg.startsWith('探测成功') ? 'text-emerald-600' : 'text-destructive'}`}>{probeMsg}</div>}
        {id === null ? null : loading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : data ? (
          <div className="space-y-4 p-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">基本信息</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Field label="名称" value={data.key.name} />
                  <Field label="密钥" value={<span className="font-mono text-xs">{data.key.key_prefix ?? ''}…{data.key.key_suffix ?? ''}</span>} />
                  <Field label="供应商" value={data.key.provider?.display_name || data.key.provider?.name || '—'} />
                  <Field label="状态" value={<StatusBadge status={data.key.status} />} />
                  <Field label="来源" value={<Badge variant="secondary" className="text-[10px]">{data.key.source_type}</Badge>} />
                  <Field label="市场状态" value={<StatusBadge status={data.key.market_status} />} />
                  <Field label="审核" value={<StatusBadge status={data.key.review_status} />} />
                  <Field label="配额类型" value={data.key.quota_type} />
                  <Field label="优先级" value={String(data.key.priority)} />
                  <Field label="并发上限" value={String(data.key.max_concurrency)} />
                  <Field label="已用/总量" value={`${formatNumber(Number(data.key.quota_used) || 0)} / ${data.key.quota_total ? formatNumber(data.key.quota_total) : '不限'}`} />
                  <Field label="到期" value={data.key.expires_at ? formatDate(data.key.expires_at) : '永久'} />
                  <Field label="最近校验" value={data.key.verified_at ?? '未校验'} />
                </dl>
                {data.key.last_validation_error && (
                  <p className="mt-2 text-xs text-destructive">校验错误：{data.key.last_validation_error}</p>
                )}
              </CardContent>
            </Card>

            {data.mappings.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">模型映射（{data.mappings.length}）</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <DataTable columns={mappingColumns} data={data.mappings} />
                </CardContent>
              </Card>
            )}

            {data.routeGroups.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">所属路由组（{data.routeGroups.length}）</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {data.routeGroups.map((g) => (
                      <Badge key={g.id} variant={g.is_system ? 'default' : 'secondary'} className="text-[10px]">{g.display_name || g.name}{g.is_system ? ' · 系统' : ''}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {data.verifications.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">最近校验记录（{data.verifications.length}）</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {data.verifications.map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-lg border p-2.5">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={v.status} />
                          {v.http_status !== null && <Badge variant="outline" className="text-[10px]">{v.http_status}</Badge>}
                          {v.latency_ms !== null && <span className="text-xs text-muted-foreground">{formatNumber(v.latency_ms)}ms</span>}
                        </div>
                        {v.error_message && <p className="mt-0.5 text-xs text-destructive">{v.error_message}</p>}
                        {v.verified_models.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">{v.verified_models.map((m) => <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>)}</div>
                        )}
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">{formatDateTime(v.created_at)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
      </SheetContent>
      <ConfirmDialog
        open={pendingDisable}
        onOpenChange={setPendingDisable}
        title="禁用账号"
        description={data ? `确认禁用账号「${data.key.name}」？禁用后该账号不再被调用。` : ''}
        confirmText="禁用"
        variant="destructive"
        onConfirm={() => doToggle('disabled')}
      />
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b border-dashed py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
