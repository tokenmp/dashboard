import { useEffect, useState } from 'react';
import { RefreshCw, Search, ChevronRight } from 'lucide-react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber } from '@/utils/format';
import type { RedeemCodeQuery } from '@/types/redeem';

function RedeemCodes() {
  const [detailId, setDetailId] = useState<string | null>(null);
  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'q', key: 'keyword' },
    { name: 'status', key: 'status' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getDashboardRedeemCodesApi, { initial: { size: 20, sort: '-created_at', ...urlInit } as RedeemCodeQuery });
  useEffect(() => { write(params); }, [params]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">兑换码管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">全平台兑换码 · 共 {formatNumber(total)} 个</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
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

      <Card><CardContent className="p-0">
        {loading && list.length === 0 ? <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          : list.length === 0 ? <EmptyState className="mx-4 my-6" title="暂无兑换码" />
          : <Table>
              <TableHeader><TableRow>
                <TableHead>名称</TableHead><TableHead className="w-[140px]">码（脱敏）</TableHead>
                <TableHead className="w-[110px]">进度</TableHead><TableHead className="w-[110px]">Token</TableHead>
                <TableHead className="w-[90px]">状态</TableHead><TableHead className="w-[150px]">有效期</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow></TableHeader>
              <TableBody>{list.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetailId(c.id)}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{c.code_prefix ?? ''}…{c.code_suffix ?? ''}</TableCell>
                  <TableCell>
                    <div className="tabular-nums text-xs">{c.redeemed_count}/{c.max_redemptions}</div>
                    <div className="mt-0.5 h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${c.max_redemptions > 0 ? Math.min(100, (c.redeemed_count / c.max_redemptions) * 100) : 0}%` }} />
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatNumber(c.token_amount)}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {(c.starts_at?.slice(0, 10) ?? '')}~{(c.expires_at?.slice(0, 10) ?? '永久')}
                  </TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>}
      </CardContent></Card>

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
    </div>
  );
}

function RedemptionsDrawer({ codeId, onClose }: { codeId: string | null; onClose: () => void }) {
  const { data, loading, error, reload } = useAsync(
    () => (codeId ? getDashboardCodeRedemptionsApi(codeId, { size: 20, sort: '-created_at' }) : Promise.resolve(null)),
    [codeId],
  );
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
                  <div className="font-mono text-xs text-muted-foreground">{data.code.code_prefix ?? ''}…{data.code.code_suffix ?? ''}</div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums text-sm">{data.code.redeemed_count}/{data.code.max_redemptions}</div>
                  <StatusBadge status={data.code.status} />
                </div>
              </div>
            </CardContent></Card>
            <Button variant="outline" size="sm" onClick={reload}>刷新</Button>
            {data.pagination.list.length === 0 ? <EmptyState title="暂无兑换记录" /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>用户</TableHead><TableHead className="w-[100px] text-right">Token</TableHead>
                  <TableHead className="w-[120px]">套餐快照</TableHead><TableHead className="w-[140px]">兑换时间</TableHead>
                </TableRow></TableHeader>
                <TableBody>{data.pagination.list.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.user?.email ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.token_amount)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.coding_plan_id && <Badge variant="outline" className="text-[10px]">coding</Badge>}
                        {r.token_plan_id && <Badge variant="outline" className="text-[10px]">token</Badge>}
                        {r.image_plan_id && <Badge variant="outline" className="text-[10px]">image</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.created_at}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default RedeemCodes;
