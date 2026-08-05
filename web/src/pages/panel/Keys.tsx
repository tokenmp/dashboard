import { useEffect, useState } from 'react';
import { RefreshCw, Plus, MoreVertical, Pencil, Trash2, Copy, Check, Power } from 'lucide-react';
import {
  getPanelKeysApi,
  getPanelBotKeysApi,
  createPanelKeyApi,
  updatePanelKeyApi,
  deletePanelKeyApi,
  createPanelBotKeyApi,
  updatePanelBotKeyApi,
  deletePanelBotKeyApi,
  type CreatedKey,
} from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { useMutation } from '@/hooks/useMutation';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

type Kind = 'api' | 'bot';
type KeyRow = {
  id: string;
  name: string;
  scope?: string | null;
  status: string;
  prefix: string;
  suffix: string;
  lastUsed: string | null;
  createdAt: string;
};

function Keys() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [apiKeys, botKeys] = await Promise.all([getPanelKeysApi(), getPanelBotKeysApi()]);
    return { apiKeys, botKeys };
  });
  const [tab, setTab] = useState<Kind>('api');
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<{ kind: Kind; row: KeyRow } | null>(null);
  const [deleting, setDeleting] = useState<{ kind: Kind; row: KeyRow } | null>(null);
  const [revealed, setRevealed] = useState<CreatedKey | null>(null);
  const { loading: submitting, mutate } = useMutation();

  const apiRows: KeyRow[] = (data?.apiKeys ?? []).map((k) => ({
    id: k.id, name: k.name, scope: null, status: k.status,
    prefix: k.key_prefix, suffix: k.key_suffix, lastUsed: k.last_used_at, createdAt: k.created_at,
  }));
  const botRows: KeyRow[] = (data?.botKeys ?? []).map((k) => ({
    id: k.id, name: k.name, scope: k.scope, status: k.status,
    prefix: k.key_prefix, suffix: k.key_suffix, lastUsed: k.last_used_at, createdAt: k.created_at,
  }));

  const onCreate = (name: string) =>
    mutate(() => (tab === 'api' ? createPanelKeyApi({ name }) : createPanelBotKeyApi({ name })), {
      successMsg: '已创建',
      onSuccess: (r) => { setCreateOpen(false); setRevealed(r); reload(); },
    }).catch(() => {});

  const onRename = (row: KeyRow, name: string) =>
    mutate(
      () => (renaming!.kind === 'api'
        ? updatePanelKeyApi(row.id, { name })
        : updatePanelBotKeyApi(row.id, { name })),
      { successMsg: '已改名', onSuccess: () => { setRenaming(null); reload(); } },
    ).catch(() => {});

  const onToggle = (kind: Kind, row: KeyRow) =>
    mutate(
      () => (kind === 'api'
        ? updatePanelKeyApi(row.id, { status: row.status === 'active' ? 'disabled' : 'active' })
        : updatePanelBotKeyApi(row.id, { status: row.status === 'active' ? 'disabled' : 'active' })),
      { successMsg: row.status === 'active' ? '已停用' : '已启用', onSuccess: () => reload() },
    ).catch(() => {});

  const onDelete = () => {
    if (!deleting) return;
    const { kind, row } = deleting;
    mutate(
      () => (kind === 'api' ? deletePanelKeyApi(row.id) : deletePanelBotKeyApi(row.id)),
      { successMsg: '已删除', onSuccess: () => { setDeleting(null); reload(); } },
    ).catch(() => {});
  };

  const rows = tab === 'api' ? apiRows : botRows;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">我的密钥</h1>
          <p className="mt-1 text-sm text-muted-foreground">我名下的 API Key 与 Bot Key（仅显示脱敏片段）</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" />新建</Button>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
          </Button>
        </div>
      </div>

      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
        <TabsList>
          <TabsTrigger value="api">API Key{apiRows.length > 0 ? ` (${apiRows.length})` : ''}</TabsTrigger>
          <TabsTrigger value="bot">Bot Key{botRows.length > 0 ? ` (${botRows.length})` : ''}</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState title={`暂无${tab === 'api' ? ' API Key' : ' Bot Key'}`} description="点击右上角「新建」生成一把密钥" />
      ) : (
        <KeyTable
          kind={tab}
          rows={rows}
          onRename={(row) => setRenaming({ kind: tab, row })}
          onToggle={(row) => onToggle(tab, row)}
          onDelete={(row) => setDeleting({ kind: tab, row })}
        />
      )}

      <CreateKeyDialog open={createOpen} kind={tab} submitting={submitting} onClose={() => setCreateOpen(false)} onSubmit={onCreate} />
      <RevealKeyDialog data={revealed} onClose={() => setRevealed(null)} />
      <RenameDialog state={renaming} submitting={submitting} onClose={() => setRenaming(null)} onSubmit={onRename} />
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除密钥？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除「{deleting?.row.name}」（{deleting?.row.prefix}…{deleting?.row.suffix}）。删除后使用该密钥的请求将立即失败，且无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive hover:bg-destructive/90">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** 密钥列表表格 + 行内操作（改名/启停/删除） */
function KeyTable({
  kind,
  rows,
  onRename,
  onToggle,
  onDelete,
}: {
  kind: Kind;
  rows: KeyRow[];
  onRename: (row: KeyRow) => void;
  onToggle: (row: KeyRow) => void;
  onDelete: (row: KeyRow) => void;
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[22%]">名称</TableHead>
            {kind === 'bot' && <TableHead className="w-[8%]">权限</TableHead>}
            <TableHead>密钥</TableHead>
            <TableHead className="w-[10%]">状态</TableHead>
            <TableHead className="w-[18%]">最近使用</TableHead>
            <TableHead className="w-[12%]">创建时间</TableHead>
            <TableHead className="w-[44px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.name || '—'}</TableCell>
              {kind === 'bot' && <TableCell className="text-xs text-muted-foreground">{r.scope ?? '—'}</TableCell>}
              <TableCell><span className="font-mono text-xs">{r.prefix}…{r.suffix}</span></TableCell>
              <TableCell><StatusBadge status={r.status} /></TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{r.lastUsed ?? '未使用'}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{r.createdAt?.slice(0, 10) ?? '—'}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onRename(r)}><Pencil className="h-4 w-4" />改名</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggle(r)}>
                      <Power className="h-4 w-4" />{r.status === 'active' ? '停用' : '启用'}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(r)}>
                      <Trash2 className="h-4 w-4" />删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** 新建密钥弹窗（输入名称） */
function CreateKeyDialog({ open, kind, submitting, onClose, onSubmit }: {
  open: boolean;
  kind: Kind;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(''); }, [open]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(name);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新建{kind === 'api' ? ' API Key' : ' Bot Key'}</DialogTitle>
          <DialogDescription>为密钥起个名字便于区分（如「生产环境」），留空则用默认名。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="k-name">名称</Label>
            <Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="可选" autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={submitting}>{submitting ? '生成中…' : '生成密钥'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 创建成功后明文一次性展示（仅此一次 + 复制） */
function RevealKeyDialog({ data, onClose }: { data: CreatedKey | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 忽略 */
    }
  };
  return (
    <Dialog open={data !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>密钥已创建</DialogTitle>
          <DialogDescription className="text-destructive">
            ⚠️ 请立即复制保存，关闭后将不再显示完整密钥。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{data?.name ? `「${data.name}」` : ''}完整密钥</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md border bg-muted px-3 py-2 text-sm">{data?.key}</code>
            <Button type="button" size="icon" variant="outline" onClick={copy} aria-label="复制">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>我已保存，关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 改名弹窗 */
function RenameDialog({ state, submitting, onClose, onSubmit }: {
  state: { kind: Kind; row: KeyRow } | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (row: KeyRow, name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState('');
  const open = state !== null;
  useEffect(() => { if (open && state) setName(state.row.name); }, [open, state]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!state) return;
    onSubmit(state.row, name);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>改名</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="r-name">名称</Label>
            <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={submitting}>{submitting ? '保存中…' : '保存'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default Keys;
