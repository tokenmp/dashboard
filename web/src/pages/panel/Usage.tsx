import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import { getPanelUsageLedgerApi, getPanelUsageQuotaApi } from '@/api/panel';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useUrlQueryState } from '@/hooks/useUrlQueryState';
import { useAsync } from '@/hooks/useAsync';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DebouncedInput } from '@/components/DebouncedInput';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCompact, formatDateTime, formatNumber } from '@/utils/format';
import type { UsageQuery, UserQuota, QuotaItem } from '@/types/usage';

const LEDGER_TYPES = ['reserve', 'charge', 'refund', 'recharge', 'adjustment', 'plan_grant', 'plan_upgrade', 'plan_renew', 'plan_replace'];
const BILLING_PLANS = ['coding', 'token', 'image', 'free'];

/**
 * 用户面·我的用量：用量流水 + 我的额度。
 * 始终是用户视角，不含计费规则等管理功能。
 */
function Usage() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'ledger';
  const switchTab = (t: string) => {
    const next = new URLSearchParams();
    if (t !== 'ledger') next.set('tab', t);
    setSp(next, { replace: true });
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">我的用量</h1>
        <p className="mt-1 text-sm text-muted-foreground">用量流水与额度总览</p>
      </div>
      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList>
          <TabsTrigger value="ledger">账本流水</TabsTrigger>
          <TabsTrigger value="quota">额度总览</TabsTrigger>
        </TabsList>
        <TabsContent value="ledger"><LedgerTab /></TabsContent>
        <TabsContent value="quota"><QuotaTab /></TabsContent>
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
  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'q', key: 'keyword' },
    { name: 'ledger', key: 'ledgerType' },
    { name: 'billing', key: 'billingPlan' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getPanelUsageLedgerApi, { initial: { size: 20, sort: '-created_at', ...urlInit } as UsageQuery });
  useEffect(() => { write(params); }, [params]);
  return (
    <div className="space-y-3">
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs text-muted-foreground">原因备注</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <DebouncedInput className="pl-8" placeholder="搜索 reason" value={params.keyword ?? ''} onDebouncedChange={(v) => setFilters({ keyword: v })} />
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
                  <TableCell className="font-mono text-xs text-muted-foreground">{formatDateTime(l.created_at)}</TableCell>
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

/* ----------------------------- 额度总览 ----------------------------- */
function QuotaTab() {
  const { data, loading, error, reload } = useAsync(getPanelUsageQuotaApi);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
      </div>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      {loading ? <Skeleton className="h-48 w-full" /> : data?.role === 'user' ? <UserQuotaView data={data} /> : null}
    </div>
  );
}

function QuotaCard({ q }: { q: QuotaItem }) {
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

function UserQuotaView({ data }: { data: UserQuota }) {
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

function planLabel(plan: string): string {
  return { coding: '编程套餐', token: 'Token 套餐', image: '图像套餐', free: '免费' }[plan] ?? plan;
}

export default Usage;
