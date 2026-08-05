import { useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCompact, formatNumber } from '@/utils/format';
import type { UsageQuery } from '@/types/usage';

const LEDGER_TYPES = ['reserve', 'charge', 'refund', 'recharge', 'adjustment', 'plan_grant', 'plan_upgrade', 'plan_renew', 'plan_replace'];
const BILLING_PLANS = ['coding', 'token', 'image', 'free'];
const PROTOCOLS = ['openai', 'anthropic', 'openai_chat', 'openai_responses', 'anthropic_messages', 'image_generation', 'tokenmp_gateway', 'custom'];

function Usage() {
  const [tab, setTab] = useState('ledger');
  const { isAdmin } = useRole();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">计费用量</h1>
        <p className="mt-1 text-sm text-muted-foreground">用量流水、额度总览与计费倍率规则</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ledger">账本流水</TabsTrigger>
          <TabsTrigger value="quota">额度总览</TabsTrigger>
          {isAdmin && <TabsTrigger value="rules">计费规则</TabsTrigger>}
        </TabsList>
        <TabsContent value="ledger"><LedgerTab /></TabsContent>
        <TabsContent value="quota"><QuotaTab /></TabsContent>
        {isAdmin && <TabsContent value="rules"><RulesTab /></TabsContent>}
      </Tabs>
    </div>
  );
}

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

/* ----------------------------- 账本流水 ----------------------------- */
function LedgerTab() {
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getUsageLedgerApiLazy, { initial: { size: 20, sort: '-created_at' } as UsageQuery });
  return (
    <div className="space-y-3">
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs text-muted-foreground">原因备注</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="搜索 reason" value={params.keyword ?? ''} onChange={(e) => setFilters({ keyword: e.target.value })} />
          </div>
        </div>
        <div className="w-[150px]">
          <label className="mb-1 block text-xs text-muted-foreground">流水类型</label>
          <Select value={params.ledgerType ?? 'all'} onValueChange={(v) => setFilters({ ledgerType: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {LEDGER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[130px]">
          <label className="mb-1 block text-xs text-muted-foreground">计费类型</label>
          <Select value={params.billingPlan ?? 'all'} onValueChange={(v) => setFilters({ billingPlan: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {BILLING_PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
      </CardContent></Card>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      <Card><CardContent className="p-0">
        {loading && list.length === 0 ? <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          : list.length === 0 ? <EmptyState className="mx-4 my-6" title="暂无流水" />
          : <Table>
              <TableHeader><TableRow>
                <TableHead className="w-[160px]">时间</TableHead><TableHead className="w-[110px]">类型</TableHead>
                <TableHead className="w-[90px]">计费</TableHead><TableHead className="w-[120px] text-right">Token Δ</TableHead>
                <TableHead className="w-[110px] text-right">请求 Δ</TableHead><TableHead>原因</TableHead>
              </TableRow></TableHeader>
              <TableBody>{list.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{l.created_at}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{l.ledger_type}</Badge></TableCell>
                  <TableCell className="text-xs">{l.billing_plan}</TableCell>
                  <TableCell className={`text-right tabular-nums ${Number(l.token_delta) < 0 ? 'text-destructive' : 'text-primary'}`}>{Number(l.token_delta) !== 0 ? formatCompact(Number(l.token_delta)) : '—'}</TableCell>
                  <TableCell className={`text-right tabular-nums ${l.request_delta < 0 ? 'text-destructive' : 'text-primary'}`}>{l.request_delta !== 0 ? formatNumber(l.request_delta) : '—'}</TableCell>
                  <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">{l.reason ?? '—'}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>}
      </CardContent></Card>
      <Pager page={page} size={size} total={total} loading={loading} setPage={setPage} />
    </div>
  );
}
import { getDashboardUsageLedgerApi } from '@/api/dashboard';
const getUsageLedgerApiLazy = (p: UsageQuery) => getDashboardUsageLedgerApi(p);

/* ----------------------------- 额度总览 ----------------------------- */
function QuotaTab() {
  const { data, loading, error, reload } = useAsync(() => getUsageQuotaApiLazy(10));
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
      </div>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      {loading ? <Skeleton className="h-48 w-full" /> : data?.role === 'admin' ? <AdminQuotaView data={data} /> : data?.role === 'user' ? <UserQuotaView data={data} /> : null}
    </div>
  );
}
import { getDashboardUsageQuotaApi } from '@/api/dashboard';
const getUsageQuotaApiLazy = (topN?: number) => getDashboardUsageQuotaApi(topN);

function QuotaCard({ q }: { q: import('@/types/usage').QuotaItem }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{planLabel(q.billingPlan)}</span>
        <Badge variant="outline">{q.unit}</Badge>
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums">{formatCompact(q.available)}</div>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <div className="flex justify-between"><span>余额</span><span className="tabular-nums">{formatNumber(q.balance)}</span></div>
        {q.chargedIn !== undefined && <div className="flex justify-between"><span>已充</span><span className="tabular-nums">{formatNumber(q.chargedIn)}</span></div>}
        {q.used !== undefined && <div className="flex justify-between"><span>已用</span><span className="tabular-nums">{formatNumber(q.used)}</span></div>}
        <div className="flex justify-between"><span>预扣中</span><span className="tabular-nums">{formatNumber(q.reserved)}</span></div>
      </div>
    </div>
  );
}

function AdminQuotaView({ data }: { data: import('@/types/usage').AdminQuota }) {
  return (
    <>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">全平台额度池</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.platform.map((q) => <QuotaCard key={q.billingPlan} q={q} />)}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">消耗 Top 用户</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>邮箱</TableHead><TableHead className="w-[90px]">角色</TableHead>
              <TableHead className="w-[130px] text-right">Token 余额</TableHead>
              <TableHead className="w-[130px] text-right">请求余额</TableHead>
            </TableRow></TableHeader>
            <TableBody>{data.topUsers.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.email}</TableCell>
                <TableCell><Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">{u.role}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{formatCompact(u.tokenBalance)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(u.requestBalance)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function UserQuotaView({ data }: { data: import('@/types/usage').UserQuota }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">我的额度</CardTitle></CardHeader>
      <CardContent>
        {data.plans.length === 0 ? <EmptyState title="暂无额度数据" /> : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.plans.map((q) => <QuotaCard key={q.billingPlan} q={q} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------------------- 计费规则 ----------------------------- */
function RulesTab() {
  const { isAdmin } = useRole();
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getPriceRulesApiLazy, { initial: { size: 20, sort: '-priority' } as UsageQuery });
  if (!isAdmin) {
    return <Card><CardContent className="py-6 text-sm text-muted-foreground">计费倍率规则仅管理员可见。</CardContent></Card>;
  }
  return (
    <div className="space-y-3">
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs text-muted-foreground">互斥组</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="搜索 exclusive_group" value={params.keyword ?? ''} onChange={(e) => setFilters({ keyword: e.target.value })} />
          </div>
        </div>
        <div className="w-[150px]">
          <label className="mb-1 block text-xs text-muted-foreground">协议</label>
          <Select value={params.protocol ?? 'all'} onValueChange={(v) => setFilters({ protocol: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {PROTOCOLS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[130px]">
          <label className="mb-1 block text-xs text-muted-foreground">叠加方式</label>
          <Select value={params.composeMode ?? 'all'} onValueChange={(v) => setFilters({ composeMode: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="set">set</SelectItem>
              <SelectItem value="multiply">multiply</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
      </CardContent></Card>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      <Card><CardContent className="p-0">
        {loading && list.length === 0 ? <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          : list.length === 0 ? <EmptyState className="mx-4 my-6" title="暂无计费规则" />
          : <Table>
              <TableHeader><TableRow>
                <TableHead className="w-[60px]">优先级</TableHead><TableHead>协议</TableHead>
                <TableHead className="w-[90px]">倍率</TableHead><TableHead className="w-[90px]">叠加</TableHead>
                <TableHead className="w-[110px]">生效时段</TableHead><TableHead className="w-[110px]">生效星期</TableHead>
                <TableHead className="w-[100px]">互斥组</TableHead><TableHead className="w-[90px]">状态</TableHead>
              </TableRow></TableHeader>
              <TableBody>{list.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums">{r.priority}</TableCell>
                  <TableCell className="text-xs">{r.protocol ?? '—'}</TableCell>
                  <TableCell className="tabular-nums font-medium">×{r.multiplier}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{r.compose_mode}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.start_time}~{r.end_time}</TableCell>
                  <TableCell className="text-xs">{r.days_of_week.length === 0 ? '每天' : r.days_of_week.join(',')}</TableCell>
                  <TableCell className="text-xs">{r.exclusive_group ?? '—'}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>}
      </CardContent></Card>
      <Pager page={page} size={size} total={total} loading={loading} setPage={setPage} />
    </div>
  );
}
import { getDashboardPriceRulesApi } from '@/api/dashboard';
const getPriceRulesApiLazy = (p: UsageQuery) => getDashboardPriceRulesApi(p);

function planLabel(plan: string): string {
  return { coding: '编程套餐', token: 'Token 套餐', image: '图像套餐', free: '免费', unknown: plan }[plan] ?? plan;
}

export default Usage;
