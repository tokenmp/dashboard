import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { RefreshCw, Search, GitBranch, Plus, Pencil, Trash2 } from 'lucide-react';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAsync } from '@/hooks/useAsync';
import { useMutation } from '@/hooks/useMutation';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { DebouncedInput } from '@/components/DebouncedInput';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatNumber } from '@/utils/format';
import {
  getDashboardNoticesApi,
  getDashboardConfigApi,
  getDashboardMigrationsApi,
  createDashboardNoticeApi,
  updateDashboardNoticeApi,
  deleteDashboardNoticeApi,
} from '@/api/dashboard';
import type { AnnouncementItem, AnnouncementPayload, SystemQuery } from '@/types/system';

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

const SEVERITY_STYLE: Record<string, { label: string; cls: string }> = {
  info: { label: '信息', cls: 'bg-sky-100 text-sky-700' },
  warning: { label: '警告', cls: 'bg-amber-100 text-amber-800' },
  urgent: { label: '紧急', cls: 'bg-red-100 text-red-700' },
};
function SeverityChip({ severity }: { severity: string }) {
  const s = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.info;
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${s.cls}`}>{s.label}</span>;
}

const SCOPE_OPTIONS = [
  { value: 'all', label: '全站' },
  { value: 'panel', label: '用户面板' },
  { value: 'landing', label: '落地页' },
];
function scopeLabel(scope: string): string {
  return SCOPE_OPTIONS.find((o) => o.value === scope)?.label ?? scope;
}

function NoticesTab() {
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getNoticesApiLazy, { initial: { size: 20, sort: '-created_at' } as SystemQuery });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementItem | null>(null);
  const [deleting, setDeleting] = useState<AnnouncementItem | null>(null);
  const { mutate } = useMutation();

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (a: AnnouncementItem) => { setEditing(a); setDialogOpen(true); };

  const confirmDelete = () => {
    if (!deleting) return;
    mutate(() => deleteDashboardNoticeApi(deleting.id), {
      successMsg: '已删除',
      onSuccess: () => { setDeleting(null); reload(); },
    }).catch(() => {});
  };

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
        <Button size="sm" onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />新建</Button>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
      </CardContent></Card>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      <div className="space-y-2">
        {loading && list.length === 0 ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          : list.length === 0 ? <EmptyState title="暂无公告" />
          : list.map((a) => (
            <Card key={a.id}><CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityChip severity={a.severity} />
                  <span className="font-medium">{a.title}</span>
                </div>
                <div className="flex items-center gap-1">
                  {a.status === 'draft' && <Badge variant="secondary" className="text-[10px]">草稿</Badge>}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)} aria-label="编辑"><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(a)} aria-label="删除"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              {a.body ? (
                <div className="prose prose-sm mt-2 max-w-none text-muted-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{a.body}</ReactMarkdown>
                </div>
              ) : null}
              <div className="mt-2 text-xs text-muted-foreground">
                范围 {scopeLabel(a.scope)} · 生效 {a.publish_from?.slice(0, 10)} ~ {a.publish_until?.slice(0, 10) ?? '长期'}
              </div>
            </CardContent></Card>
          ))}
      </div>
      <Pager page={page} size={size} total={total} loading={loading} setPage={setPage} />

      <NoticeDialog
        open={dialogOpen}
        item={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={reload}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除公告？</AlertDialogTitle>
            <AlertDialogDescription>
              将归档公告「{deleting?.title}」，归档后不再展示。此操作可由重新编辑恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
const getNoticesApiLazy = (p: SystemQuery) => getDashboardNoticesApi(p);

const EMPTY_NOTICE: AnnouncementPayload = {
  title: '',
  body: '',
  severity: 'info',
  scope: 'all',
  dismissible: true,
  status: 'published',
  sort_order: 0,
  publish_from: '',
  publish_until: null,
};

/** datetime 字段转 datetime-local 输入框值（取前16位、空格→T） */
function toDateTimeLocal(s: string | null): string {
  return s ? s.slice(0, 16).replace(' ', 'T') : '';
}

function toForm(a: AnnouncementItem): AnnouncementPayload {
  return {
    title: a.title,
    body: a.body,
    severity: (['info', 'warning', 'urgent'].includes(a.severity) ? a.severity : 'info') as AnnouncementPayload['severity'],
    scope: a.scope,
    dismissible: a.dismissible,
    status: (['draft', 'published', 'archived'].includes(a.status) ? a.status : 'draft') as AnnouncementPayload['status'],
    sort_order: a.sort_order,
    publish_from: toDateTimeLocal(a.publish_from),
    publish_until: a.publish_until ? toDateTimeLocal(a.publish_until) : null,
  };
}

function NoticeDialog({ open, item, onClose, onSaved }: {
  open: boolean;
  item: AnnouncementItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = item !== null;
  const { loading, mutate } = useMutation();
  const [form, setForm] = useState<AnnouncementPayload>(EMPTY_NOTICE);

  useEffect(() => {
    if (open) setForm(item ? toForm(item) : EMPTY_NOTICE);
  }, [open, item]);

  const set = <K extends keyof AnnouncementPayload>(k: K, v: AnnouncementPayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: AnnouncementPayload = {
      ...form,
      // datetime-local 空串 → 发当前时间；publish_until 空串 → null
      publish_from: form.publish_from || new Date().toISOString().slice(0, 16),
      publish_until: form.publish_until || null,
    };
    mutate(
      () => (isEdit ? updateDashboardNoticeApi(item!.id, payload) : createDashboardNoticeApi(payload)),
      { successMsg: isEdit ? '已更新' : '已创建', onSuccess: () => { onSaved(); onClose(); } },
    ).catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? '编辑公告' : '新建公告'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="n-title">标题</Label>
            <Input id="n-title" required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="公告标题" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="n-body">正文</Label>
            <Textarea id="n-body" rows={4} value={form.body} onChange={(e) => set('body', e.target.value)} placeholder="公告正文" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>严重级别</Label>
              <Select value={form.severity} onValueChange={(v) => set('severity', v as AnnouncementPayload['severity'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">info</SelectItem>
                  <SelectItem value="warning">warning</SelectItem>
                  <SelectItem value="urgent">urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>状态</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v as AnnouncementPayload['status'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="published">已发布</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>展示范围</Label>
              <Select value={form.scope} onValueChange={(v) => set('scope', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}（{o.value}）</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-sort">排序权重</Label>
              <Input id="n-sort" type="number" value={form.sort_order} onChange={(e) => set('sort_order', Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="n-from">生效起始</Label>
              <Input id="n-from" type="datetime-local" value={form.publish_from} onChange={(e) => set('publish_from', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-until">生效截止（留空=长期）</Label>
              <Input id="n-until" type="datetime-local" value={form.publish_until ?? ''} onChange={(e) => set('publish_until', e.target.value || null)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="n-dismiss" checked={form.dismissible} onCheckedChange={(v) => set('dismissible', v)} />
            <Label htmlFor="n-dismiss" className="cursor-pointer">用户可手动关闭</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={loading}>{loading ? '保存中…' : '保存'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
