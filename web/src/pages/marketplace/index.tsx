import { useEffect } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCompact, formatNumber } from '@/utils/format';
import type { MarketplaceQuery } from '@/types/marketplace';

function Marketplace() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'listings';
  const switchTab = (t: string) => {
    const next = new URLSearchParams();
    if (t !== 'listings') next.set('tab', t);
    setSp(next, { replace: true });
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">市场分账</h1>
        <p className="mt-1 text-sm text-muted-foreground">上架挂单、结算流水与分账账本</p>
      </div>
      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList>
          <TabsTrigger value="listings">上架管理</TabsTrigger>
          <TabsTrigger value="settlements">结算流水</TabsTrigger>
          <TabsTrigger value="ledger">分账账本</TabsTrigger>
        </TabsList>
        <TabsContent value="listings"><ListingsTab /></TabsContent>
        <TabsContent value="settlements"><SettlementsTab /></TabsContent>
        <TabsContent value="ledger"><LedgerTab /></TabsContent>
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

const LISTING_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'online', 'paused', 'suspended'];
const SETTLEMENT_STATUSES = ['pending', 'available', 'reversed', 'disputed'];
const USAGE_SOURCES = ['upstream', 'platform_tokenizer', 'estimated', 'manual'];
const LEDGER_STATUSES = ['pending', 'available', 'completed', 'reversed', 'frozen'];
const ENTRY_TYPES = ['consumer_charge', 'supplier_reward_pending', 'supplier_reward_available', 'supplier_reward_reversal', 'platform_fee', 'manual_adjustment', 'withdrawal'];

function SearchBar({ children, onReload, loading }: { children: React.ReactNode; onReload: () => void; loading: boolean }) {
  return (
    <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
      {children}
      <Button variant="outline" size="sm" onClick={onReload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
    </CardContent></Card>
  );
}

function KeywordInput({ value, onChange, placeholder = '搜索' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex-1 min-w-[180px]">
      <label className="mb-1 block text-xs text-muted-foreground">关键字</label>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <DebouncedInput className="pl-8" placeholder={placeholder} value={value} onDebouncedChange={onChange} />
      </div>
    </div>
  );
}

function StatusSelect({ value, onChange, options, label = '状态' }: { value: string; onChange: (v: string) => void; options: string[]; label?: string }) {
  return (
    <div className="w-[140px]">
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <Select value={value || 'all'} onValueChange={(v) => onChange(v === 'all' ? '' : v)}>
        <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部</SelectItem>
          {options.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function TableSkeleton() {
  return <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
}

/* ----------------------------- 上架管理 ----------------------------- */
function ListingsTab() {
  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'q', key: 'keyword' },
    { name: 'status', key: 'status' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getListingsApiLazy, { initial: { size: 20, sort: '-created_at', ...urlInit } as MarketplaceQuery });
  useEffect(() => { write(params); }, [params]);
  return (
    <div className="space-y-3">
      <SearchBar onReload={reload} loading={loading}>
        <KeywordInput value={params.keyword ?? ''} onChange={(v) => setFilters({ keyword: v })} placeholder="搜索挂单" />
        <StatusSelect value={params.status ?? ''} onChange={(v) => setFilters({ status: v })} options={LISTING_STATUSES} />
      </SearchBar>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      <Card><CardContent className="p-0">
        {loading && list.length === 0 ? <TableSkeleton /> : list.length === 0 ? <EmptyState className="mx-4 my-6" title="暂无挂单" /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>卖家</TableHead><TableHead className="w-[110px]">审核状态</TableHead>
              <TableHead className="w-[100px] text-right">平台抽成</TableHead><TableHead className="w-[120px] text-right">输入价</TableHead>
              <TableHead className="w-[120px] text-right">输出价</TableHead><TableHead className="w-[140px]">上线时间</TableHead>
            </TableRow></TableHeader>
            <TableBody>{list.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-sm">{l.sellerUser?.email ?? '—'}</TableCell>
                <TableCell><StatusBadge status={l.status} /></TableCell>
                <TableCell className="text-right tabular-nums">{(l.platform_fee_rate * 100).toFixed(2)}%</TableCell>
                <TableCell className="text-right tabular-nums text-xs">{l.input_sale_price_per_token}</TableCell>
                <TableCell className="text-right tabular-nums text-xs">{l.output_sale_price_per_token}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{l.published_at?.slice(0, 10) ?? '—'}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent></Card>
      <Pager page={page} size={size} total={total} loading={loading} setPage={setPage} />
    </div>
  );
}
import { getDashboardListingsApi } from '@/api/dashboard';
const getListingsApiLazy = (p: MarketplaceQuery) => getDashboardListingsApi(p);

/* ----------------------------- 结算流水 ----------------------------- */
function SettlementsTab() {
  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'source', key: 'usageSource' },
    { name: 'status', key: 'status' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getSettlementsApiLazy, { initial: { size: 20, sort: '-created_at', ...urlInit } as MarketplaceQuery });
  useEffect(() => { write(params); }, [params]);
  return (
    <div className="space-y-3">
      <SearchBar onReload={reload} loading={loading}>
        <StatusSelect label="用量来源" value={params.usageSource ?? ''} onChange={(v) => setFilters({ usageSource: v })} options={USAGE_SOURCES} />
        <StatusSelect value={params.status ?? ''} onChange={(v) => setFilters({ status: v })} options={SETTLEMENT_STATUSES} />
      </SearchBar>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      <Card><CardContent className="p-0">
        {loading && list.length === 0 ? <TableSkeleton /> : list.length === 0 ? <EmptyState className="mx-4 my-6" title="暂无结算单" /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>买家</TableHead><TableHead>卖家</TableHead>
              <TableHead className="w-[110px] text-right">买家付</TableHead><TableHead className="w-[110px] text-right">卖家得</TableHead>
              <TableHead className="w-[110px] text-right">平台抽成</TableHead><TableHead className="w-[90px]">来源</TableHead>
              <TableHead className="w-[90px]">状态</TableHead><TableHead className="w-[140px]">时间</TableHead>
            </TableRow></TableHeader>
            <TableBody>{list.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="text-xs">{s.consumerUser?.email ?? '—'}</TableCell>
                <TableCell className="text-xs">{s.supplierUser?.email ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums text-xs">{formatCompact(s.consumer_amount)}</TableCell>
                <TableCell className="text-right tabular-nums text-xs text-primary">{formatCompact(s.supplier_reward)}</TableCell>
                <TableCell className="text-right tabular-nums text-xs">{formatCompact(s.platform_fee)}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{s.usage_source}</Badge></TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{s.created_at}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent></Card>
      <Pager page={page} size={size} total={total} loading={loading} setPage={setPage} />
    </div>
  );
}
import { getDashboardSettlementsApi } from '@/api/dashboard';
const getSettlementsApiLazy = (p: MarketplaceQuery) => getDashboardSettlementsApi(p);

/* ----------------------------- 分账账本 ----------------------------- */
function LedgerTab() {
  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'entry', key: 'entryType' },
    { name: 'status', key: 'status' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getLedgerApiLazy, { initial: { size: 20, sort: '-created_at', ...urlInit } as MarketplaceQuery });
  useEffect(() => { write(params); }, [params]);
  return (
    <div className="space-y-3">
      <SearchBar onReload={reload} loading={loading}>
        <StatusSelect label="业务类型" value={params.entryType ?? ''} onChange={(v) => setFilters({ entryType: v })} options={ENTRY_TYPES} />
        <StatusSelect value={params.status ?? ''} onChange={(v) => setFilters({ status: v })} options={LEDGER_STATUSES} />
      </SearchBar>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      <Card><CardContent className="p-0">
        {loading && list.length === 0 ? <TableSkeleton /> : list.length === 0 ? <EmptyState className="mx-4 my-6" title="暂无账本流水" /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-[160px]">业务类型</TableHead><TableHead className="w-[110px] text-right">金额</TableHead>
              <TableHead className="w-[90px]">状态</TableHead><TableHead className="w-[150px]">解冻时间</TableHead>
              <TableHead className="w-[150px]">时间</TableHead>
            </TableRow></TableHeader>
            <TableBody>{list.map((l) => (
              <TableRow key={l.id}>
                <TableCell><Badge variant="secondary" className="text-[10px]">{l.entry_type}</Badge></TableCell>
                <TableCell className={`text-right tabular-nums ${l.amount < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCompact(l.amount)}</TableCell>
                <TableCell><StatusBadge status={l.status} /></TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{l.available_at?.slice(0, 16)?.replace('T', ' ') ?? '—'}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{l.created_at}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent></Card>
      <Pager page={page} size={size} total={total} loading={loading} setPage={setPage} />
    </div>
  );
}
import { getDashboardLedgerApi } from '@/api/dashboard';
const getLedgerApiLazy = (p: MarketplaceQuery) => getDashboardLedgerApi(p);

export default Marketplace;
