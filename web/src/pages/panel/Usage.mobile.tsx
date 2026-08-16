import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import { getPanelUsageLedgerApi, getPanelUsageTimelineApi, getPanelUsageByModelApi } from '@/api/panel';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useUrlQueryState } from '@/hooks/useUrlQueryState';
import { useAsync } from '@/hooks/useAsync';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DebouncedInput } from '@/components/DebouncedInput';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModelIcon } from '@/components/ModelIcon';
import { FilterChip, FilterChipRow, MobileCard, MobilePagination } from '@/components/mobile';
import { formatCompact, formatDateTime, formatNumber } from '@/utils/format';
import type { UsageQuery, UsageTimelineItem, UsageByModelItem, UsageLedgerItem } from '@/types/usage';
import { BILLING_PLANS, LEDGER_TYPES, PLAN_LABEL, QuotaTab, deltaFor, formatBucketTime, planByRequest } from './Usage';

/**
 * 我的用量·移动端：Tabs 横向可滚；时间线/按模型改弹性宽度防溢出；
 * 账本流水改卡片流；额度总览复用桌面端响应式组件。
 */
export function UsageMobile() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'timeline';
  const switchTab = (t: string) => {
    const next = new URLSearchParams();
    if (t !== 'timeline') next.set('tab', t);
    setSp(next, { replace: true });
  };
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-sm font-bold">我的用量</h1>
        <p className="mt-0.5 text-[10.5px] text-muted-foreground">最近扣费趋势、账本流水与额度总览</p>
      </div>
      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList className="h-8 w-full justify-start gap-1 overflow-x-auto p-0.5">
          <TabsTrigger value="timeline" className="h-[26px] shrink-0 px-2.5 text-[11.5px]">最近扣费</TabsTrigger>
          <TabsTrigger value="by-model" className="h-[26px] shrink-0 px-2.5 text-[11.5px]">按模型</TabsTrigger>
          <TabsTrigger value="ledger" className="h-[26px] shrink-0 px-2.5 text-[11.5px]">账本流水</TabsTrigger>
          <TabsTrigger value="quota" className="h-[26px] shrink-0 px-2.5 text-[11.5px]">额度总览</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline"><TimelineTab /></TabsContent>
        <TabsContent value="by-model"><ByModelTab /></TabsContent>
        <TabsContent value="ledger"><LedgerTab /></TabsContent>
        <TabsContent value="quota"><QuotaTab /></TabsContent>
      </Tabs>
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
      <FilterChipRow className="px-0">
        <FilterChip
          label="粒度"
          options={[
            { value: 'hour', label: '每小时' },
            { value: '10min', label: '每 10 分钟' },
          ]}
          value={interval}
          onChange={setIntervalSel}
          allValue="hour"
        />
        <FilterChip
          label="时间"
          options={[
            { value: '24', label: '最近 24 小时' },
            { value: '72', label: '最近 3 天' },
            { value: '168', label: '最近 7 天' },
          ]}
          value={String(hours)}
          onChange={(v) => setHoursSel(Number(v))}
          allValue="24"
        />
        <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1 rounded-lg px-2.5 text-[11.5px]" onClick={reload} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />刷新
        </Button>
      </FilterChipRow>

      {error && <Card className="border-destructive"><CardContent className="py-2.5 text-[13px] text-destructive">{error}</CardContent></Card>}

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
            <Card key={plan}><CardContent className="p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <div>
                  <span className="text-[13px] font-semibold">{PLAN_LABEL[plan] ?? plan}</span>
                  <span className="ml-1.5 text-[10.5px] text-muted-foreground">按 {byReq ? '请求次数' : 'Token'} 扣费</span>
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground">净 <span className={`font-semibold ${sum < 0 ? 'text-destructive' : sum > 0 ? 'text-primary' : 'text-foreground'}`}>{byReq ? formatNumber(sum) : formatCompact(sum)}</span> {unit} · {formatNumber(sumCnt)} 笔</span>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {buckets.slice().reverse().map((b) => (
                  <div key={b.ts} className="flex items-center gap-2 border-b py-1.5 last:border-0">
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatBucketTime(b.ts)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div className={`h-full rounded-full ${b.v < 0 ? 'bg-destructive' : b.v > 0 ? 'bg-primary' : ''}`} style={{ width: `${Math.min(100, (Math.abs(b.v) / maxAbs) * 100)}%` }} />
                      </div>
                    </div>
                    <span className={`w-[72px] shrink-0 text-right text-[11px] tabular-nums ${b.v < 0 ? 'text-destructive' : b.v > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{b.v !== 0 ? (byReq ? formatNumber(b.v) : formatCompact(b.v)) : '—'}</span>
                    <span className="w-7 shrink-0 text-right text-[11px] text-muted-foreground">{b.cnt > 0 ? `${b.cnt}` : ''}</span>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          );
        })}
    </div>
  );
}

/* ----------------------------- 按模型 ----------------------------- */
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
      <FilterChipRow className="px-0">
        <FilterChip
          label="时间"
          options={[
            { value: '24', label: '最近 24 小时' },
            { value: '72', label: '最近 3 天' },
            { value: '168', label: '最近 7 天' },
          ]}
          value={String(hours)}
          onChange={(v) => setHoursSel(Number(v))}
          allValue="24"
        />
        <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1 rounded-lg px-2.5 text-[11.5px]" onClick={reload} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />刷新
        </Button>
      </FilterChipRow>

      {error && <Card className="border-destructive"><CardContent className="py-2.5 text-[13px] text-destructive">{error}</CardContent></Card>}

      {loading ? <Skeleton className="h-48 w-full" />
        : plans.length === 0 ? <EmptyState title="暂无扣费数据" />
        : plans.map(([plan, items]) => {
          const byReq = planByRequest(plan);
          const unit = byReq ? '次' : 'token';
          const vals = items.map((i) => (byReq ? i.request_charge : i.token_charge));
          const max = Math.max(1, ...vals);
          const total = vals.reduce((s, v) => s + v, 0);
          return (
            <Card key={plan}><CardContent className="p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <div>
                  <span className="text-[13px] font-semibold">{PLAN_LABEL[plan] ?? plan}</span>
                  <span className="ml-1.5 text-[10.5px] text-muted-foreground">按 {byReq ? '请求次数' : 'Token'} 扣费</span>
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground">合计 <span className="font-semibold text-foreground">{byReq ? formatNumber(total) : formatCompact(total)}</span> {unit}</span>
              </div>
              <div className="space-y-2">
                {items.map((m) => {
                  const v = byReq ? m.request_charge : m.token_charge;
                  const pct = (v / max) * 100;
                  return (
                    <div key={m.model} title={`${m.model}：${formatNumber(v)} ${unit} · ${m.cnt} 笔`}>
                      <div className="flex items-center gap-1.5">
                        <ModelIcon id={m.model} size={16} />
                        <span className="min-w-0 flex-1 truncate text-[11px]">{m.model}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{byReq ? formatNumber(v) : formatCompact(v)} · {m.cnt} 笔</span>
                      </div>
                      <div className="mt-1 h-4 w-full overflow-hidden rounded bg-muted">
                        <div className="h-full rounded bg-foreground" style={{ width: `${Math.max(pct, 3)}%` }} />
                      </div>
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
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <DebouncedInput className="h-8 rounded-lg px-2.5 pl-8 text-xs" placeholder="搜索 reason" value={params.keyword ?? ''} onDebouncedChange={(v) => setFilters({ keyword: v })} />
      </div>
      <FilterChipRow className="px-0">
        <FilterChip
          label="类型"
          options={[{ value: 'all', label: '全部' }, ...LEDGER_TYPES.map((t) => ({ value: t, label: t }))]}
          value={params.ledgerType ?? 'all'}
          onChange={(v) => setFilters({ ledgerType: v === 'all' ? '' : v })}
        />
        <FilterChip
          label="计费"
          options={[{ value: 'all', label: '全部' }, ...BILLING_PLANS.map((p) => ({ value: p, label: p }))]}
          value={params.billingPlan ?? 'all'}
          onChange={(v) => setFilters({ billingPlan: v === 'all' ? '' : v })}
        />
        <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1 rounded-lg px-2.5 text-[11.5px]" onClick={reload} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />刷新
        </Button>
      </FilterChipRow>
      {error && <Card className="border-destructive"><CardContent className="py-2.5 text-[13px] text-destructive">{error}</CardContent></Card>}
      {loading && list.length === 0 ? (
        <div className="space-y-[7px]">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[72px] w-full rounded-xl" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState title="暂无流水" />
      ) : (
        <div className="space-y-[7px]">
          {list.map((item) => <LedgerCard key={item.id} item={item} />)}
        </div>
      )}
      {total > 0 && (
        <MobilePagination page={page} size={size} total={total} onPageChange={setPage} />
      )}
    </div>
  );
}

/** 账本流水卡片：时间为主键，类型/计费为徽标，变动着色，原因为弱化行。 */
function LedgerCard({ item }: { item: UsageLedgerItem }) {
  const d = deltaFor(item);
  return (
    <MobileCard
      title={<span className="font-mono text-[13px]">{formatDateTime(item.created_at)}</span>}
      badge={
        <>
          <Badge variant="secondary" className="text-[10.5px]">{item.ledger_type}</Badge>
          <Badge variant="outline" className="text-[10.5px]">{item.billing_plan}</Badge>
        </>
      }
      fields={[
        {
          key: 'delta',
          label: '变动',
          value: (
            <span className={d < 0 ? 'text-destructive' : d > 0 ? 'text-primary' : ''}>
              {d !== 0 ? (item.billing_plan === 'coding' ? formatNumber(d) : formatCompact(d)) : '—'}
            </span>
          ),
        },
      ]}
    >
      {item.reason && <div className="mt-1.5 truncate text-[10.5px] text-muted-foreground" title={item.reason}>{item.reason}</div>}
    </MobileCard>
  );
}
