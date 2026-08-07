import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import { getPanelUsageLedgerApi, getPanelUsageQuotaApi, getPanelUsageTimelineApi, getPanelUsageByModelApi } from '@/api/panel';
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
import { ModelIcon } from '@/components/ModelIcon';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCompact, formatDateTime, formatNumber } from '@/utils/format';
import type { UsageQuery, UserQuota, QuotaItem, UsageByModelItem, UsageLedgerItem, UsageTimelineItem } from '@/types/usage';

const LEDGER_TYPES = ['charge', 'refund', 'recharge', 'adjustment', 'plan_grant', 'plan_upgrade', 'plan_renew', 'plan_replace'];
const BILLING_PLANS = ['coding', 'token', 'image', 'free'];

/**
 * 用户面·我的用量：用量流水 + 我的额度。
 * 始终是用户视角，不含计费规则等管理功能。
 */
function Usage() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'timeline';
  const switchTab = (t: string) => {
    const next = new URLSearchParams();
    if (t !== 'timeline') next.set('tab', t);
    setSp(next, { replace: true });
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">我的用量</h1>
        <p className="mt-1 text-sm text-muted-foreground">最近扣费趋势、账本流水与额度总览</p>
      </div>
      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList>
          <TabsTrigger value="timeline">最近扣费</TabsTrigger>
          <TabsTrigger value="by-model">按模型</TabsTrigger>
          <TabsTrigger value="ledger">账本流水</TabsTrigger>
          <TabsTrigger value="quota">额度总览</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline"><TimelineTab /></TabsContent>
        <TabsContent value="by-model"><ByModelTab /></TabsContent>
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

/* ----------------------------- 最近扣费 ----------------------------- */
function TimelineTab() {
  const [interval, setIntervalSel] = useState('hour');
  const [hours, setHoursSel] = useState(24);
  const { data, loading, error, reload } = useAsync(() => getPanelUsageTimelineApi({ interval, hours }), [interval, hours]);

  const plans = useMemo(() => {
    const map = new Map<string, UsageTimelineItem[]>();
    for (const d of data ?? []) {
      if (!map.has(d.billing_plan)) map.set(d.billing_plan, []);
      map.get(d.billing_plan)!.push(d);
    }
    return Array.from(map.entries());
  }, [data]);

  const bucketsFor = (items: UsageTimelineItem[], byReq: boolean) => {
    const stepMs = interval === '10min' ? 600_000 : 3_600_000;
    const count = (hours * 3_600_000) / stepMs;
    const valMap = new Map(items.map((d) => [Date.parse(d.bucket), byReq ? d.request_delta : d.token_delta]));
    const cntMap = new Map(items.map((d) => [Date.parse(d.bucket), d.cnt]));
    const nowMs = Date.now();
    const start = Math.floor(nowMs / stepMs) * stepMs;
    const arr: { ts: number; v: number; cnt: number }[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const ts = start - i * stepMs;
      arr.push({ ts, v: valMap.get(ts) ?? 0, cnt: cntMap.get(ts) ?? 0 });
    }
    return arr;
  };

  return (
    <div className="space-y-3">
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="w-[140px]">
          <label className="mb-1 block text-xs text-muted-foreground">时间粒度</label>
          <Select value={interval} onValueChange={setIntervalSel}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hour">每小时</SelectItem>
              <SelectItem value="10min">每 10 分钟</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-[150px]">
          <label className="mb-1 block text-xs text-muted-foreground">时间范围</label>
          <Select value={String(hours)} onValueChange={(v) => setHoursSel(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24">最近 24 小时</SelectItem>
              <SelectItem value="72">最近 3 天</SelectItem>
              <SelectItem value="168">最近 7 天</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
      </CardContent></Card>

      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      {loading ? <Skeleton className="h-48 w-full" />
        : plans.length === 0 ? <EmptyState title="暂无扣费数据" />
        : plans.map(([plan, items]) => {
          const byReq = planByRequest(plan);
          const unit = byReq ? '次' : 'token';
          const buckets = bucketsFor(items, byReq);
          const sum = buckets.reduce((s, b) => s + b.v, 0);
          const sumCnt = buckets.reduce((s, b) => s + b.cnt, 0);
          const maxAbs = Math.max(1, ...buckets.map((b) => Math.abs(b.v)));
          return (
            <Card key={plan}><CardContent className="p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <div>
                  <span className="text-sm font-medium">{PLAN_LABEL[plan] ?? plan}</span>
                  <span className="ml-2 text-xs text-muted-foreground">按 {byReq ? '请求次数' : 'Token'} 扣费</span>
                </div>
                <span className="text-sm tabular-nums text-muted-foreground">净 <span className={`font-semibold ${sum < 0 ? 'text-destructive' : sum > 0 ? 'text-primary' : 'text-foreground'}`}>{byReq ? formatNumber(sum) : formatCompact(sum)}</span> {unit} · {formatNumber(sumCnt)} 笔</span>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {buckets.slice().reverse().map((b) => (
                  <div key={b.ts} className="flex items-center gap-3 border-b py-1.5 text-sm last:border-0">
                    <span className="w-[110px] shrink-0 font-mono text-xs text-muted-foreground">{formatBucketTime(b.ts)}</span>
                    <div className="flex-1">
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div className={`h-full rounded-full ${b.v < 0 ? 'bg-destructive' : b.v > 0 ? 'bg-primary' : ''}`} style={{ width: `${Math.min(100, (Math.abs(b.v) / maxAbs) * 100)}%` }} />
                      </div>
                    </div>
                    <span className={`w-[90px] shrink-0 text-right tabular-nums ${b.v < 0 ? 'text-destructive' : b.v > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{b.v !== 0 ? (byReq ? formatNumber(b.v) : formatCompact(b.v)) : '—'}</span>
                    <span className="w-[50px] shrink-0 text-right text-xs text-muted-foreground">{b.cnt > 0 ? `${b.cnt}` : ''}</span>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          );
        })}
    </div>
  );
}

function formatBucketTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ----------------------------- 按模型 ----------------------------- */
const PLAN_LABEL: Record<string, string> = { coding: '编程套餐', token: 'Token 套餐', image: '图像套餐' };
const planByRequest = (plan: string) => plan === 'coding';

function ByModelTab() {
  const [hours, setHoursSel] = useState(24);
  const { data, loading, error, reload } = useAsync(() => getPanelUsageByModelApi({ hours }), [hours]);

  const plans = useMemo(() => {
    const map = new Map<string, UsageByModelItem[]>();
    for (const d of data ?? []) {
      if (!map.has(d.billing_plan)) map.set(d.billing_plan, []);
      map.get(d.billing_plan)!.push(d);
    }
    return Array.from(map.entries());
  }, [data]);

  return (
    <div className="space-y-3">
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="w-[150px]">
          <label className="mb-1 block text-xs text-muted-foreground">时间范围</label>
          <Select value={String(hours)} onValueChange={(v) => setHoursSel(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24">最近 24 小时</SelectItem>
              <SelectItem value="72">最近 3 天</SelectItem>
              <SelectItem value="168">最近 7 天</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
      </CardContent></Card>

      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      {loading ? <Skeleton className="h-48 w-full" />
        : plans.length === 0 ? <EmptyState title="暂无扣费数据" />
        : plans.map(([plan, items]) => {
          const byReq = planByRequest(plan);
          const unit = byReq ? '次' : 'token';
          const vals = items.map((i) => (byReq ? i.request_charge : i.token_charge));
          const max = Math.max(1, ...vals);
          const total = vals.reduce((s, v) => s + v, 0);
          return (
            <Card key={plan}><CardContent className="p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <div>
                  <span className="text-sm font-medium">{PLAN_LABEL[plan] ?? plan}</span>
                  <span className="ml-2 text-xs text-muted-foreground">按 {byReq ? '请求次数' : 'Token'} 扣费</span>
                </div>
                <span className="text-sm tabular-nums text-muted-foreground">合计 <span className="font-semibold text-foreground">{byReq ? formatNumber(total) : formatCompact(total)}</span> {unit}</span>
              </div>
              <div className="space-y-2">
                {items.map((m) => {
                  const v = byReq ? m.request_charge : m.token_charge;
                  const pct = (v / max) * 100;
                  return (
                    <div key={m.model} className="flex items-center gap-3" title={`${m.model}：${formatNumber(v)} ${unit} · ${m.cnt} 笔`}>
                      <span className="flex w-36 shrink-0 items-center gap-1.5 text-sm" title={m.model}>
                        <ModelIcon id={m.model} size={16} />
                        <span className="truncate">{m.model}</span>
                      </span>
                      <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
                        <div className="flex h-full items-center justify-end rounded bg-foreground px-2" style={{ width: `${Math.max(pct, 3)}%` }}>
                          {pct > 18 && <span className="text-[10px] font-medium text-white">{byReq ? formatNumber(v) : formatCompact(v)}</span>}
                        </div>
                      </div>
                      <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{byReq ? formatNumber(v) : formatCompact(v)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent></Card>
          );
        })}
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
                <TableHead className="w-[90px]">计费</TableHead><TableHead className="w-[120px] text-right">变动</TableHead>
                <TableHead>原因</TableHead>
              </TableRow></TableHeader>
              <TableBody>{list.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{formatDateTime(l.created_at)}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{l.ledger_type}</Badge></TableCell>
                  <TableCell className="text-xs">{l.billing_plan}</TableCell>
                  <TableCell className={`text-right tabular-nums ${deltaFor(l) < 0 ? 'text-destructive' : deltaFor(l) > 0 ? 'text-primary' : ''}`}>{deltaFor(l) !== 0 ? (l.billing_plan === 'coding' ? formatNumber(deltaFor(l)) : formatCompact(deltaFor(l))) : '—'}</TableCell>
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

/** 按计费套餐取该流水的实际变动值（coding=请求次数，其余=token） */
function deltaFor(l: UsageLedgerItem): number {
  return l.billing_plan === 'coding' ? l.request_delta : Number(l.token_delta);
}

export default Usage;
