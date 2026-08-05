import { useState } from 'react';
import { RefreshCw, Search, Megaphone, GitBranch } from 'lucide-react';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAsync } from '@/hooks/useAsync';
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
import { formatNumber } from '@/utils/format';
import { getDashboardNoticesApi, getDashboardConfigApi, getDashboardMigrationsApi } from '@/api/dashboard';
import type { SystemQuery } from '@/types/system';

function System() {
  const [tab, setTab] = useState('notices');
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">系统</h1>
        <p className="mt-1 text-sm text-muted-foreground">公告、系统配置与迁移台账</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="notices">公告</TabsTrigger>
          <TabsTrigger value="config">系统配置</TabsTrigger>
          <TabsTrigger value="migrations">迁移台账</TabsTrigger>
        </TabsList>
        <TabsContent value="notices"><NoticesTab /></TabsContent>
        <TabsContent value="config"><ConfigTab /></TabsContent>
        <TabsContent value="migrations"><MigrationsTab /></TabsContent>
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

function NoticesTab() {
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getNoticesApiLazy, { initial: { size: 20, sort: '-sort_order' } as SystemQuery });
  return (
    <div className="space-y-3">
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs text-muted-foreground">标题搜索</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <DebouncedInput className="pl-8" placeholder="搜索公告标题" value={params.keyword ?? ''} onDebouncedChange={(v) => setFilters({ keyword: v })} />
          </div>
        </div>
        <div className="w-[120px]">
          <label className="mb-1 block text-xs text-muted-foreground">状态</label>
          <Select value={params.status ?? 'all'} onValueChange={(v) => setFilters({ status: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="draft">草稿</SelectItem>
              <SelectItem value="published">已发布</SelectItem>
              <SelectItem value="archived">已归档</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
      </CardContent></Card>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      <div className="space-y-2">
        {loading && list.length === 0 ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          : list.length === 0 ? <EmptyState title="暂无公告" />
          : list.map((a) => (
            <Card key={a.id}><CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{a.title}</span>
                  <Badge variant={a.severity === 'urgent' ? 'destructive' : 'outline'} className="text-[10px]">{a.severity}</Badge>
                  {a.dismissible && <Badge variant="outline" className="text-[10px]">可关闭</Badge>}
                </div>
                <StatusBadge status={a.status} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{a.body}</p>
              <div className="mt-1 text-xs text-muted-foreground">
                范围 {a.scope} · 生效 {a.publish_from?.slice(0, 10)} ~ {a.publish_until?.slice(0, 10) ?? '长期'}
              </div>
            </CardContent></Card>
          ))}
      </div>
      <Pager page={page} size={size} total={total} loading={loading} setPage={setPage} />
    </div>
  );
}
const getNoticesApiLazy = (p: SystemQuery) => getDashboardNoticesApi(p);

function ConfigTab() {
  const { data, loading, error, reload } = useAsync(getDashboardConfigApi);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
      </div>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      {loading ? <Skeleton className="h-48 w-full" /> : data && data.length > 0 ? (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-[260px]">Key</TableHead><TableHead>Value</TableHead>
              <TableHead className="w-[90px]">敏感</TableHead><TableHead className="w-[160px]">更新时间</TableHead>
            </TableRow></TableHeader>
            <TableBody>{data.map((c) => (
              <TableRow key={c.key}>
                <TableCell className="font-mono text-xs">{c.key}</TableCell>
                <TableCell className="font-mono text-xs">
                  {c.sensitive ? <span className="text-muted-foreground">******</span>
                    : typeof c.value === 'boolean' ? String(c.value)
                    : typeof c.value === 'object' ? JSON.stringify(c.value)
                    : String(c.value ?? '—')}
                </TableCell>
                <TableCell>{c.sensitive ? <Badge variant="destructive" className="text-[10px]">敏感</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{c.updated_at}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </CardContent></Card>
      ) : <EmptyState title="暂无配置" />}
    </div>
  );
}

function MigrationsTab() {
  const { list, total, page, size, loading, error, reload, setPage } =
    usePagedQuery(getMigrationsApiLazy, { initial: { size: 20 } as SystemQuery });
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
      </div>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      <Card><CardContent className="p-0">
        {loading && list.length === 0 ? <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          : list.length === 0 ? <EmptyState className="mx-4 my-6" title="暂无迁移记录" /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>迁移文件</TableHead><TableHead className="w-[180px]">应用时间</TableHead>
            </TableRow></TableHeader>
            <TableBody>{list.map((m) => (
              <TableRow key={m.filename}>
                <TableCell className="font-mono text-xs"><span className="inline-flex items-center gap-1.5"><GitBranch className="h-3 w-3 text-muted-foreground" />{m.filename}</span></TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{m.applied_at}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent></Card>
      <Pager page={page} size={size} total={total} loading={loading} setPage={setPage} />
    </div>
  );
}
const getMigrationsApiLazy = (p: SystemQuery) => getDashboardMigrationsApi(p);

export default System;
