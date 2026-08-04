import { useState } from 'react';
import { RefreshCw, Search, ChevronRight } from 'lucide-react';
import { getUpstreamKeysApi, getUpstreamKeyDetailApi } from '@/api/upstream';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAsync } from '@/hooks/useAsync';
import { useRole } from '@/hooks/useRole';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCompact, formatNumber } from '@/utils/format';
import type { UpstreamQuery } from '@/types/upstream';

const MARKET_STATUSES = ['online', 'offline', 'paused', 'degraded', 'exhausted', 'suspended'];

export function KeysTab() {
  const { isAdmin } = useRole();
  const [detailId, setDetailId] = useState<string | null>(null);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getUpstreamKeysApi, { initial: { size: 20, sort: '-created_at' } as UpstreamQuery });

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs text-muted-foreground">名称搜索</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="搜索 Key 名称" value={params.keyword ?? ''} onChange={(e) => setFilters({ keyword: e.target.value })} />
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
        </CardContent>
      </Card>

      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      <Card><CardContent className="p-0">
        {loading && list.length === 0 ? <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          : list.length === 0 ? <EmptyState className="mx-4 my-6" title="暂无上游 Key" description={isAdmin ? undefined : '你还没有自有的上游 Key'} />
          : <Table>
              <TableHeader><TableRow>
                <TableHead>名称</TableHead><TableHead className="w-[110px]">供应商</TableHead>
                <TableHead className="w-[90px]">来源</TableHead><TableHead className="w-[100px]">市场状态</TableHead>
                <TableHead className="w-[80px]">审核</TableHead><TableHead className="w-[100px] text-right">用量</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow></TableHeader>
              <TableBody>{list.map((k) => (
                <TableRow key={k.id} className="cursor-pointer" onClick={() => setDetailId(k.id)}>
                  <TableCell>
                    <div className="font-medium">{k.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{k.key_prefix ?? ''}…{k.key_suffix ?? ''}</div>
                  </TableCell>
                  <TableCell className="text-xs">{k.provider?.display_name || k.provider?.name || '—'}</TableCell>
                  <TableCell><Badge variant={k.source_type === 'user' ? 'secondary' : 'outline'} className="text-[10px]">{k.source_type}</Badge></TableCell>
                  <TableCell><StatusBadge status={k.market_status} /></TableCell>
                  <TableCell><StatusBadge status={k.review_status} /></TableCell>
                  <TableCell className="text-right">
                    <UsageBar used={Number(k.quota_used) || 0} total={k.quota_total} />
                  </TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>}
      </CardContent></Card>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>第 {page} / {Math.max(1, Math.ceil(total / size))} 页 · 每页 {size} 条 · 共 {formatNumber(total)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / size) || loading} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      )}

      <KeyDetailDrawer id={detailId} onClose={() => setDetailId(null)} />
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

function KeyDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, loading, error } = useAsync(
    () => (id ? getUpstreamKeyDetailApi(id) : Promise.resolve(null)),
    [id],
  );
  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>上游 Key 详情</SheetTitle></SheetHeader>
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
                  <Field label="到期" value={data.key.expires_at ?? '永久'} />
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
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>模型</TableHead><TableHead className="w-[120px]">端点</TableHead>
                      <TableHead className="w-[100px] text-right">输入价</TableHead><TableHead className="w-[100px] text-right">输出价</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{data.mappings.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="font-medium">{m.model?.name ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">{m.upstream_model_name ?? ''}</div>
                        </TableCell>
                        <TableCell className="text-xs">{m.providerEndpoint ? `${m.providerEndpoint.protocol}` : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{m.input_price_per_token ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{m.output_price_per_token ?? '—'}</TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
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
                      <span className="font-mono text-[10px] text-muted-foreground">{v.created_at}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
      </SheetContent>
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
