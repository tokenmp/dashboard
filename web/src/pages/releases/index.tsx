import { useEffect, useState, type FormEvent } from 'react';
import { BookOpen, CheckCircle2, GitBranch, MoreVertical, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createDashboardReleaseApi,
  deleteDashboardReleaseApi,
  getDashboardReleaseDetailApi,
  getDashboardReleasesApi,
  updateDashboardReleaseApi,
} from '@/api/dashboard';
import { EmptyState } from '@/components/EmptyState';
import { Markdown } from '@/components/Markdown';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAsync } from '@/hooks/useAsync';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { getApiError } from '@/utils/error';
import { formatDate, formatDateTime, formatNumber } from '@/utils/format';
import type { SystemQuery, VersionReleaseItem } from '@/types/system';

type EditorState = {
  mode: 'create' | 'edit';
  data: VersionReleaseItem | null;
};

type ReleaseForm = {
  version: string;
  title: string;
  summary: string;
  body: string;
  release_type: string;
  status: string;
  sort_order: string;
  released_at: string;
};

function getDatetimeLocalValue(value?: string): string {
  const source = value ? value.replace(' ', 'T') : undefined;
  const date = source ? new Date(source) : new Date();
  if (Number.isNaN(date.getTime())) return source?.slice(0, 16) ?? '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function getInitialForm(data: VersionReleaseItem | null): ReleaseForm {
  return {
    version: data?.version ?? '',
    title: data?.title ?? '',
    summary: data?.summary ?? '',
    body: data?.body ?? '',
    release_type: data?.release_type ?? 'feature',
    status: data?.status ?? 'draft',
    sort_order: String(data?.sort_order ?? 0),
    released_at: getDatetimeLocalValue(data?.released_at),
  };
}

function parseTagMessage(msg: string): Partial<VersionReleaseItem> {
  const lines = msg.split(/\r?\n/);
  const firstLine = lines[0] || '';
  const versionMatch = firstLine.match(/^(v\d+\.\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : '';
  const title = firstLine.replace(/^v\d+\.\d+\.\d+\s*:\s*/, '').trim();
  let body = lines.slice(1).join('\n').trim();
  let releaseType = 'feature';
  let summary = '';
  let status = 'published';
  const frontMatterMatch = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);

  if (frontMatterMatch) {
    const yaml = frontMatterMatch[1];
    body = frontMatterMatch[2].trim();
    for (const line of yaml.split(/\r?\n/)) {
      const fieldMatch = line.match(/^(\w+)\s*:\s*(.+)$/);
      if (!fieldMatch) continue;
      const key = fieldMatch[1].toLowerCase();
      const value = fieldMatch[2].trim();
      if (key === 'type') releaseType = value;
      else if (key === 'summary') summary = value;
      else if (key === 'status') status = value;
    }
  }

  if (!summary) summary = title;
  const sortMatch = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  const sortOrder = sortMatch
    ? Number(sortMatch[1]) * 10_000 + Number(sortMatch[2]) * 100 + Number(sortMatch[3])
    : 0;

  return {
    version,
    title,
    summary,
    body,
    release_type: releaseType,
    status,
    sort_order: sortOrder,
  };
}

function Releases() {
  const { list, total, page, size, loading, error, reload, setPage } = usePagedQuery(getReleasesApiLazy, { initial: { size: 20, sort: '-sort_order' } as SystemQuery });
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleting, setDeleting] = useState<VersionReleaseItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const confirmDelete = async () => {
    if (!deleting || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      await deleteDashboardReleaseApi(deleting.id);
      toast.success('已删除');
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">更新日志</h1>
          <p className="mt-1 text-sm text-muted-foreground">版本发布记录 · 共 {formatNumber(total)} 条</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
          <Button size="sm" onClick={() => setEditor({ mode: 'create', data: null })}><Plus className="mr-1.5 h-4 w-4" />新增版本</Button>
        </div>
      </div>
      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}
      {loading && list.length === 0 ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        : list.length === 0 ? <EmptyState title="暂无版本发布" /> : (
        <div className="space-y-2">
          {list.map((release) => (
            <ReleaseRow
              key={release.id}
              release={release}
              onEdit={() => setEditor({ mode: 'edit', data: release })}
              onDelete={() => setDeleting(release)}
            />
          ))}
        </div>
      )}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>第 {page} / {Math.max(1, Math.ceil(total / size))} 页</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / size) || loading} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      )}

      {editor && (
        <ReleaseEditorDialog
          open
          mode={editor.mode}
          data={editor.data}
          onOpenChange={(open) => !open && setEditor(null)}
          onDone={reload}
        />
      )}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && !deleteSubmitting && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除版本「{deleting?.version}」？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该版本将被归档，不再出现在版本列表中。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteSubmitting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleteSubmitting ? '删除中…' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const getReleasesApiLazy = (params: SystemQuery) => getDashboardReleasesApi(params);

function ReleaseRow({
  release,
  onEdit,
  onDelete,
}: {
  release: VersionReleaseItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card className="cursor-pointer transition-colors hover:bg-accent/50" onClick={() => setOpen(true)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-mono text-sm font-medium">{release.version}</span>
                <Badge variant="outline" className="text-[10px]">{release.release_type}</Badge>
              </div>
              <div className="mt-1 font-medium">{release.title}</div>
              {release.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{release.summary}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{formatDate(release.released_at)}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`管理版本 ${release.version}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenuItem onSelect={onEdit}>
                    <Pencil className="mr-2 h-4 w-4" />编辑
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
                    <Trash2 className="mr-2 h-4 w-4" />删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>
      <ReleaseDetailDrawer id={open ? release.id : null} onClose={() => setOpen(false)} />
    </>
  );
}

function ReleaseEditorDialog({
  open,
  mode,
  data,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  data: VersionReleaseItem | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<ReleaseForm>(() => getInitialForm(data));
  const [submitting, setSubmitting] = useState(false);
  const [tagMessageOpen, setTagMessageOpen] = useState(false);
  const [tagMessage, setTagMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(getInitialForm(data));
    setTagMessageOpen(false);
    setTagMessage('');
  }, [open, mode, data]);

  const updateField = (field: keyof ReleaseForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const parseMessage = () => {
    if (!tagMessage.trim()) {
      toast.error('请先粘贴 Tag Message');
      return;
    }
    const parsed = parseTagMessage(tagMessage.trim());
    setForm((current) => ({
      ...current,
      version: parsed.version ?? current.version,
      title: parsed.title ?? current.title,
      summary: parsed.summary ?? current.summary,
      body: parsed.body ?? current.body,
      release_type: parsed.release_type ?? current.release_type,
      status: parsed.status ?? current.status,
      sort_order: String(parsed.sort_order ?? current.sort_order),
    }));
    toast.success('Tag Message 已解析');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (mode === 'create' && !form.version.trim()) {
      toast.error('版本号不能为空');
      return;
    }
    if (!form.title.trim()) {
      toast.error('标题不能为空');
      return;
    }

    const payload: Partial<VersionReleaseItem> = {
      version: form.version.trim(),
      title: form.title.trim(),
      summary: form.summary.trim(),
      body: form.body,
      release_type: form.release_type,
      status: form.status,
      sort_order: Number(form.sort_order) || 0,
      released_at: form.released_at,
    };

    setSubmitting(true);
    try {
      if (mode === 'create') {
        await createDashboardReleaseApi(payload);
        toast.success('已创建');
      } else {
        if (!data) throw new Error('缺少待编辑的版本数据');
        await updateDashboardReleaseApi(data.id, payload);
        toast.success('已保存');
      }
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新增版本' : `编辑版本 ${data?.version ?? ''}`}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="release-version">版本号</Label>
              <Input
                id="release-version"
                value={form.version}
                onChange={(event) => updateField('version', event.target.value)}
                placeholder="v0.1.1"
                readOnly={mode === 'edit'}
                required
                autoFocus={mode === 'create'}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="release-title">标题</Label>
              <Input
                id="release-title"
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                placeholder="本次版本的标题"
                required
                autoFocus={mode === 'edit'}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="release-summary">摘要</Label>
            <Input
              id="release-summary"
              value={form.summary}
              onChange={(event) => updateField('summary', event.target.value)}
              placeholder="可选的简短摘要"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="release-body">Markdown 正文</Label>
            <Textarea
              id="release-body"
              className="min-h-48 font-mono"
              value={form.body}
              onChange={(event) => updateField('body', event.target.value)}
              placeholder="输入版本更新内容…"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>发布类型</Label>
              <Select value={form.release_type} onValueChange={(value) => updateField('release_type', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="feature">feature</SelectItem>
                  <SelectItem value="fix">fix</SelectItem>
                  <SelectItem value="improvement">improvement</SelectItem>
                  <SelectItem value="perf">perf</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>状态</Label>
              <Select value={form.status} onValueChange={(value) => updateField('status', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">draft</SelectItem>
                  <SelectItem value="published">published</SelectItem>
                  <SelectItem value="archived">archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="release-sort-order">排序值</Label>
              <Input
                id="release-sort-order"
                type="number"
                value={form.sort_order}
                onChange={(event) => updateField('sort_order', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="release-released-at">发布时间</Label>
              <Input
                id="release-released-at"
                type="datetime-local"
                value={form.released_at}
                onChange={(event) => updateField('released_at', event.target.value)}
                required
              />
            </div>
          </div>

          {mode === 'create' && (
            <div className="space-y-3 rounded-lg border p-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setTagMessageOpen((current) => !current)}>
                <GitBranch className="mr-1.5 h-4 w-4" />
                {tagMessageOpen ? '收起 Tag Message' : '从 Git Tag 加载'}
              </Button>
              {tagMessageOpen && (
                <div className="space-y-2">
                  <Label htmlFor="release-tag-message">粘贴 annotated tag 的完整 Message</Label>
                  <Textarea
                    id="release-tag-message"
                    className="min-h-36 font-mono"
                    value={tagMessage}
                    onChange={(event) => setTagMessage(event.target.value)}
                    placeholder={'v0.1.1: 版本标题\n\n---\ntype: feature\nsummary: 简短摘要\nstatus: published\n---\n正文内容'}
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={parseMessage}>解析并填充</Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={submitting}>{submitting ? (mode === 'create' ? '创建中…' : '保存中…') : (mode === 'create' ? '创建' : '保存')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, loading, error } = useAsync(() => (id ? getDashboardReleaseDetailApi(id) : Promise.resolve(null)), [id]);
  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>版本详情</SheetTitle></SheetHeader>
        {id === null ? null : loading ? <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          : error ? <div className="p-4 text-sm text-destructive">{error}</div>
          : data ? (
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-[10px]">{data.release.version}</Badge>
              <Badge variant="outline" className="text-[10px]">{data.release.release_type}</Badge>
              {data.readAt && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3 w-3" />已读</span>
              )}
            </div>
            <h2 className="text-lg font-semibold">{data.release.title}</h2>
            {data.release.summary && <p className="text-sm text-muted-foreground">{data.release.summary}</p>}
            <div className="rounded-lg border bg-muted/30 p-4">
              <Markdown>{data.release.body}</Markdown>
            </div>
            <div className="text-xs text-muted-foreground">发布时间：{formatDateTime(data.release.released_at)}</div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default Releases;
