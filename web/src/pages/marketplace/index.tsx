import { useEffect, useMemo } from 'react';
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
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { formatCompact, formatDate, formatDateTime, formatNumber } from '@/utils/format';
import type { MarketplaceListingItem, MarketplaceQuery, MarketplaceSettlementItem, MarketplaceLedgerItem } from '@/types/marketplace';

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

  const columns = useMemo<ColumnDef<MarketplaceListingItem>[]>(() => [
    { id: 'seller', header: ({ column }) => <DataTableColumnHeader column={column} title="卖家" />, cell: ({ row }) => <span className="text-sm">{row.original.sellerUser?.email ?? '—'}</span> },
    { id: 'status', meta: { className: 'w-[110px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">审核状态</span>, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: 'fee', meta: { className: 'w-[100px] text-right' }, header: () => <span className="text-xs font-medium text-muted-foreground">平台抽成</span>, cell: ({ row }) => <span className="block text-right tabular-nums">{(row.original.platform_fee_rate * 100).toFixed(2)}%</span> },
    { id: 'input', meta: { className: 'w-[120px] text-right' }, header: () => <span className="text-xs font-medium text-muted-foreground">输入价</span>, cell: ({ row }) => <span className="block text-right tabular-nums text-xs">{row.original.input_sale_price_per_token}</span> },
    { id: 'output', meta: { className: 'w-[120px] text-right' }, header: () => <span className="text-xs font-medium text-muted-foreground">输出价</span>, cell: ({ row }) => <span className="block text-right tabular-nums text-xs">{row.original.output_sale_price_per_token}</span> },
    { id: 'published', meta: { className: 'w-[140px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">上线时间</span>, cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.published_at ? formatDate(row.original.published_at) : '—'}</span> },
  ], []);

  return (
    <div className="space-y-3">
      <SearchBar onReload={reload} loading={loading}>
        <KeywordInput value={params.keyword ?? ''} onChange={(v) => setFilters({ keyword: v })} placeholder="搜索挂单" />
        <StatusSelect value={params.status ?? ''} onChange={(v) => setFilters({ status: v })} options={LISTING_STATUSES} />
      </SearchBar>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      {loading && list.length === 0 ? <TableSkeleton /> : <DataTable columns={columns} data={list} emptyComponent={<EmptyState className="mx-4 my-6" title="暂无挂单" />} />}
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

  const columns = useMemo<ColumnDef<MarketplaceSettlementItem>[]>(() => [
    { id: 'consumer', header: ({ column }) => <DataTableColumnHeader column={column} title="买家" />, cell: ({ row }) => <span className="text-xs">{row.original.consumerUser?.email ?? '—'}</span> },
    { id: 'supplier', header: ({ column }) => <DataTableColumnHeader column={column} title="卖家" />, cell: ({ row }) => <span className="text-xs">{row.original.supplierUser?.email ?? '—'}</span> },
    { id: 'consumer_amount', meta: { className: 'w-[110px] text-right' }, header: () => <span className="text-xs font-medium text-muted-foreground">买家付</span>, cell: ({ row }) => <span className="block text-right tabular-nums text-xs">{formatCompact(row.original.consumer_amount)}</span> },
    { id: 'supplier_reward', meta: { className: 'w-[110px] text-right' }, header: () => <span className="text-xs font-medium text-muted-foreground">卖家得</span>, cell: ({ row }) => <span className="block text-right tabular-nums text-xs text-primary">{formatCompact(row.original.supplier_reward)}</span> },
    { id: 'platform_fee', meta: { className: 'w-[110px] text-right' }, header: () => <span className="text-xs font-medium text-muted-foreground">平台抽成</span>, cell: ({ row }) => <span className="block text-right tabular-nums text-xs">{formatCompact(row.original.platform_fee)}</span> },
    { id: 'usage_source', meta: { className: 'w-[90px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">来源</span>, cell: ({ row }) => <Badge variant="outline" className="text-[10px]">{row.original.usage_source}</Badge> },
    { id: 'status', meta: { className: 'w-[90px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">状态</span>, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: 'created_at', meta: { className: 'w-[140px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">时间</span>, cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{formatDateTime(row.original.created_at)}</span> },
  ], []);

  return (
    <div className="space-y-3">
      <SearchBar onReload={reload} loading={loading}>
        <StatusSelect label="用量来源" value={params.usageSource ?? ''} onChange={(v) => setFilters({ usageSource: v })} options={USAGE_SOURCES} />
        <StatusSelect value={params.status ?? ''} onChange={(v) => setFilters({ status: v })} options={SETTLEMENT_STATUSES} />
      </SearchBar>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      {loading && list.length === 0 ? <TableSkeleton /> : <DataTable columns={columns} data={list} emptyComponent={<EmptyState className="mx-4 my-6" title="暂无结算单" />} />}
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

  const columns = useMemo<ColumnDef<MarketplaceLedgerItem>[]>(() => [
    { id: 'entry_type', meta: { className: 'w-[160px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">业务类型</span>, cell: ({ row }) => <Badge variant="secondary" className="text-[10px]">{row.original.entry_type}</Badge> },
    { accessorKey: 'amount', meta: { className: 'w-[110px] text-right' }, header: ({ column }) => <DataTableColumnHeader column={column} title="金额" />, cell: ({ row }) => { const l = row.original; return <span className={`block text-right tabular-nums ${l.amount < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCompact(l.amount)}</span>; } },
    { id: 'status', meta: { className: 'w-[90px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">状态</span>, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: 'available_at', meta: { className: 'w-[150px]' }, header: () => <span className="text-xs font-medium text-muted-foreground">解冻时间</span>, cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.available_at ? formatDateTime(row.original.available_at) : '—'}</span> },
    { accessorKey: 'created_at', meta: { className: 'w-[150px]' }, header: ({ column }) => <DataTableColumnHeader column={column} title="时间" />, cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{formatDateTime(row.original.created_at)}</span> },
  ], []);

  return (
    <div className="space-y-3">
      <SearchBar onReload={reload} loading={loading}>
        <StatusSelect label="业务类型" value={params.entryType ?? ''} onChange={(v) => setFilters({ entryType: v })} options={ENTRY_TYPES} />
        <StatusSelect value={params.status ?? ''} onChange={(v) => setFilters({ status: v })} options={LEDGER_STATUSES} />
      </SearchBar>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      {loading && list.length === 0 ? <TableSkeleton /> : <DataTable columns={columns} data={list} emptyComponent={<EmptyState className="mx-4 my-6" title="暂无账本流水" />} />}
      <Pager page={page} size={size} total={total} loading={loading} setPage={setPage} />
    </div>
  );
}
import { getDashboardLedgerApi } from '@/api/dashboard';
const getLedgerApiLazy = (p: MarketplaceQuery) => getDashboardLedgerApi(p);

export default Marketplace;
