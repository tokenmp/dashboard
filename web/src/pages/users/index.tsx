import { useState } from 'react';
import { RefreshCw, Search, ChevronRight, KeyRound, Bot, Package } from 'lucide-react';
import { getDashboardUsersApi, getDashboardUserDetailApi } from '@/api/dashboard';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAsync } from '@/hooks/useAsync';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DebouncedInput } from '@/components/DebouncedInput';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCompact, formatNumber } from '@/utils/format';
import type { UserListQuery } from '@/types/user';

function Users() {
  const [detailId, setDetailId] = useState<string | null>(null);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getDashboardUsersApi, { initial: { size: 20, sort: '-created_at' } as UserListQuery });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">用户管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">全平台用户 · 共 {formatNumber(total)} 人</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs text-muted-foreground">邮箱搜索</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <DebouncedInput className="pl-8" placeholder="搜索邮箱"
                value={params.keyword ?? ''}
                onDebouncedChange={(v) => setFilters({ keyword: v })} />
            </div>
          </div>
          <div className="w-[120px]">
            <label className="mb-1 block text-xs text-muted-foreground">角色</label>
            <Select value={params.role ?? 'all'} onValueChange={(v) => setFilters({ role: v === 'all' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
                <SelectItem value="user">user</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-[120px]">
            <label className="mb-1 block text-xs text-muted-foreground">状态</label>
            <Select value={params.status ?? 'all'} onValueChange={(v) => setFilters({ status: v === 'all' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="active">启用</SelectItem>
                <SelectItem value="disabled">禁用</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      <Card>
        <CardContent className="p-0">
          {loading && list.length === 0 ? (
            <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : list.length === 0 ? (
            <EmptyState className="mx-4 my-6" title="暂无用户" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">邮箱</TableHead>
                  <TableHead className="w-[90px]">角色</TableHead>
                  <TableHead className="w-[90px]">状态</TableHead>
                  <TableHead className="w-[110px]">首选计费</TableHead>
                  <TableHead className="w-[160px]">注册时间</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((u) => (
                  <TableRow key={u.id} className="cursor-pointer" onClick={() => setDetailId(u.id)}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell><Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">{u.role}</Badge></TableCell>
                    <TableCell><StatusBadge status={u.status} /></TableCell>
                    <TableCell className="text-xs">{u.preferred_billing}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{u.created_at}</TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>第 {page} / {Math.max(1, Math.ceil(total / size))} 页 · 每页 {size} 条</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / size) || loading} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      )}

      <DetailDrawer id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function DetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, loading, error } = useAsync(
    () => (id ? getDashboardUserDetailApi(id) : Promise.resolve(null)),
    [id],
  );
  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>用户详情</SheetTitle></SheetHeader>
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
                  <Row label="邮箱" value={data.user.email} />
                  <Row label="角色" value={<Badge variant={data.user.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">{data.user.role}</Badge>} />
                  <Row label="状态" value={<StatusBadge status={data.user.status} />} />
                  <Row label="首选计费" value={data.user.preferred_billing} />
                  <Row label="回退计费" value={data.user.fallback_enabled ? '是' : '否'} />
                  <Row label="注册时间" value={<span className="font-mono text-xs">{data.user.created_at}</span>} />
                </dl>
              </CardContent>
            </Card>

            {data.usage.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">用量汇总</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    {data.usage.map((u) => (
                      <div key={u.billingPlan} className="rounded-lg border p-3">
                        <Badge variant="outline" className="text-[10px]">{u.billingPlan}</Badge>
                        <div className="mt-1 text-xs text-muted-foreground">Token 余额</div>
                        <div className="text-sm font-semibold tabular-nums">{formatCompact(u.tokenBalance)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">请求余额</div>
                        <div className="text-sm font-semibold tabular-nums">{formatNumber(u.requestBalance)}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <KeySection icon={<KeyRound className="h-3 w-3" />} title="API Key" items={data.apiKeys.map((k) => ({ id: k.id, name: k.name, masked: `${k.key_prefix}…${k.key_suffix}`, status: k.status, sub: k.last_used_at ? `最近 ${k.last_used_at}` : '未使用' }))} />
            <KeySection icon={<Bot className="h-3 w-3" />} title="Bot Key" items={data.botKeys.map((k) => ({ id: k.id, name: k.name, masked: `${k.key_prefix}…${k.key_suffix}`, status: k.status, sub: `scope: ${k.scope}` }))} />

            {data.plans.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Package className="h-3 w-3" />持有套餐（{data.plans.length}）</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {data.plans.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border p-2.5">
                      <div>
                        <div className="text-sm font-medium">{p.plan?.name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.plan_type} · 生效 {p.activated_at?.slice(0, 10)} · 过期 {p.expires_at?.slice(0, 10) ?? '永久'}
                        </div>
                      </div>
                      <StatusBadge status={p.status} />
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b border-dashed py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function KeySection({ icon, title, items }: { icon: React.ReactNode; title: string; items: { id: string; name: string; masked: string; status: string; sub: string }[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5">{icon}{title}（{items.length}）</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.map((k) => (
          <div key={k.id} className="flex items-center justify-between rounded-lg border p-2.5">
            <div>
              <div className="text-sm font-medium">{k.name}</div>
              <div className="font-mono text-xs text-muted-foreground">{k.masked}</div>
              <div className="text-xs text-muted-foreground">{k.sub}</div>
            </div>
            <StatusBadge status={k.status} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default Users;
