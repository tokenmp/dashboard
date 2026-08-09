import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, ChevronRight, Plus } from 'lucide-react';
import { getDashboardRedeemCodesApi, getDashboardCodeRedemptionsApi } from '@/api/dashboard';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useUrlQueryState } from '@/hooks/useUrlQueryState';
import { useAsync } from '@/hooks/useAsync';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DebouncedInput } from '@/components/DebouncedInput';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { formatDate, formatDateTime, formatNumber } from '@/utils/format';
import type { RedeemCodeItem, RedeemCodeQuery, RedeemCodeRedemptionItem } from '@/types/redeem';
import CreateRedeemCodeDialog from './CreateRedeemCodeDialog';

function RedeemCodes() {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'q', key: 'keyword' },
    { name: 'status', key: 'status' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getDashboardRedeemCodesApi, { initial: { size: 20, sort: '-created_at', ...urlInit } as RedeemCodeQuery });
  useEffect(() => { write(params); }, [params]);

  const columns = useMemo<ColumnDef<RedeemCodeItem>[]>(() => [
    { accessorKey: 'name', header: ({ column }) => <DataTableColumnHeader column={column} title="名称" />, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: 'code', meta: { className: 'w-[180px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">兑换码</span>, cell: ({ row }) => { const c = row.original; return <span className="font-mono text-xs text-muted-foreground">{c.code_plaintext ?? `${c.code_prefix ?? ''}…${c.code_suffix ?? ''}`}</span>; } },
    { id: 'progress', meta: { className: 'w-[110px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">进度</span>, cell: ({ row }) => { const c = row.original; return (<><div className="tabular-nums text-xs">{c.redeemed_count}/{c.max_redemptions}</div><div className="mt-0.5 h-1.5 w-20 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${c.max_redemptions > 0 ? Math.min(100, (c.redeemed_count / c.max_redemptions) * 100) : 0}%` }} /></div></>); } },
    { accessorKey: 'token_amount', meta: { className: 'w-[110px]' }, header: ({ column }) => <DataTableColumnHeader column={column} title="Token" />, cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.token_amount)}</span> },
    { id: 'status', meta: { className: 'w-[90px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">状态</span>, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: 'validity', meta: { className: 'w-[150px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">有效期</span>, cell: ({ row }) => { const c = row.original; return <span className="text-xs text-muted-foreground">{(c.starts_at ? formatDate(c.starts_at) : '')}~{(c.expires_at ? formatDate(c.expires_at) : '永久')}</span>; } },
    { id: 'action', meta: { className: 'w-[60px]' }, header: () => null, cell: () => <ChevronRight className="h-4 w-4 text-muted-foreground" /> },
  ], []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">兑换码管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">全平台兑换码 · 共 {formatNumber(total)} 个</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" />新建兑换码</Button>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
        </div>
      </div>

      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs text-muted-foreground">名称搜索</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <DebouncedInput className="pl-8" placeholder="搜索兑换码名称" value={params.keyword ?? ''} onDebouncedChange={(v) => setFilters({ keyword: v })} />
          </div>
        </div>
        <div className="w-[120px]">
          <label className="mb-1 block text-xs text-muted-foreground">状态</label>
          <Select value={params.status ?? 'all'} onValueChange={(v) => setFilters({ status: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="active">有效</SelectItem>
              <SelectItem value="disabled">停用</SelectItem>
              <SelectItem value="deleted">已删除</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      {loading && list.length === 0 ? <Card><CardContent className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</CardContent></Card>
        : <DataTable columns={columns} data={list} onRowClick={(c) => setDetailId(c.id)} emptyComponent={<EmptyState title="暂无兑换码" />} />}

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>第 {page} / {Math.max(1, Math.ceil(total / size))} 页 · 每页 {size} 条</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / size) || loading} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      )}

      <RedemptionsDrawer codeId={detailId} onClose={() => setDetailId(null)} />
      <CreateRedeemCodeDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={reload} />
    </div>
  );
}

function RedemptionsDrawer({ codeId, onClose }: { codeId: string | null; onClose: () => void }) {
  const { data, loading, error, reload } = useAsync(
    () => (codeId ? getDashboardCodeRedemptionsApi(codeId, { size: 20, sort: '-created_at' }) : Promise.resolve(null)),
    [codeId],
  );
  const recordColumns = useMemo<ColumnDef<RedeemCodeRedemptionItem>[]>(() => [
    { id: 'user', header: ({ column }) => <DataTableColumnHeader column={column} title="用户" />, cell: ({ row }) => <span className="text-sm">{row.original.user?.email ?? '—'}</span> },
    { accessorKey: 'token_amount', meta: { className: 'w-[100px] text-right' }, header: ({ column }) => <DataTableColumnHeader column={column} title="Token" />, cell: ({ row }) => <span className="block text-right tabular-nums">{formatNumber(row.original.token_amount)}</span> },
    { id: 'plans', meta: { className: 'w-[120px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">套餐快照</span>, cell: ({ row }) => { const r = row.original; return (<div className="flex flex-wrap gap-1">{r.coding_plan_id && <Badge variant="outline" className="text-[10px]">coding</Badge>}{r.token_plan_id && <Badge variant="outline" className="text-[10px]">token</Badge>}{r.image_plan_id && <Badge variant="outline" className="text-[10px]">image</Badge>}</div>); } },
    { id: 'code', meta: { className: 'w-[160px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">码值</span>, cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.code ?? '—'}</span> },
    { accessorKey: 'created_at', meta: { className: 'w-[140px]' }, header: ({ column }) => <DataTableColumnHeader column={column} title="兑换时间" />, cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{formatDateTime(row.original.created_at)}</span> },
  ], []);
  return (
    <Sheet open={codeId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>兑换记录</SheetTitle></SheetHeader>
        {codeId === null ? null : loading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : data ? (
          <div className="space-y-3 p-4">
            <Card><CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{data.code.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{data.code.code_plaintext ?? `${data.code.code_prefix ?? ''}…${data.code.code_suffix ?? ''}`}</div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums text-sm">{data.code.redeemed_count}/{data.code.max_redemptions}</div>
                  <StatusBadge status={data.code.status} />
                </div>
              </div>
            </CardContent></Card>
            <Button variant="outline" size="sm" onClick={reload}>刷新</Button>
            {data.pagination.list.length === 0 ? <EmptyState title="暂无兑换记录" /> : <DataTable columns={recordColumns} data={data.pagination.list} />}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default RedeemCodes;
