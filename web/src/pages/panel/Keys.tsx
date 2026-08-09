import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Plus, MoreVertical, Pencil, Trash2, Copy, Check, Power, ExternalLink, TriangleAlert, ChevronDown } from 'lucide-react';
import {
  getPanelKeysApi,
  getPanelBotKeysApi,
  createPanelKeyApi,
  updatePanelKeyApi,
  deletePanelKeyApi,
  createPanelBotKeyApi,
  updatePanelBotKeyApi,
  deletePanelBotKeyApi,
  getPanelModelsApi,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ModelIcon } from '@/components/ModelIcon';
import { formatDate, formatDateTime } from '@/utils/format';
import {
  TOOL_IMPORT_TARGETS,
  buildImportDeepLink,
  type CCSwitchApp,
} from '@/utils/ccswitch';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
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
  const columns = useMemo<ColumnDef<KeyRow>[]>(() => {
    const cols: ColumnDef<KeyRow>[] = [
      { accessorKey: 'name', meta: { className: 'w-[22%]' }, header: ({ column }) => <DataTableColumnHeader column={column} title="名称" />, cell: ({ row }) => <span className="font-medium">{row.original.name || '—'}</span> },
    ];
    if (kind === 'bot') {
      cols.push({ id: 'scope', meta: { className: 'w-[8%]' }, header: () => <span className="text-xs font-medium text-muted-foreground">权限</span>, cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.scope ?? '—'}</span> });
    }
    cols.push(
      { id: 'key', header: () => <span className="text-xs font-medium text-muted-foreground">密钥</span>, cell: ({ row }) => <span className="font-mono text-xs">{row.original.prefix}…{row.original.suffix}</span> },
      { id: 'status', meta: { className: 'w-[10%]' }, header: () => <span className="text-xs font-medium text-muted-foreground">状态</span>, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { accessorKey: 'lastUsed', meta: { className: 'w-[18%]' }, header: ({ column }) => <DataTableColumnHeader column={column} title="最近使用" />, cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.lastUsed ? formatDateTime(row.original.lastUsed) : '未使用'}</span> },
      { accessorKey: 'createdAt', meta: { className: 'w-[12%]' }, header: ({ column }) => <DataTableColumnHeader column={column} title="创建时间" />, cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
      {
        id: 'action',
        meta: { className: 'w-[44px]' },
        header: () => null,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRename(row.original)}><Pencil className="h-4 w-4" />改名</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggle(row.original)}>
                <Power className="h-4 w-4" />{row.original.status === 'active' ? '停用' : '启用'}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(row.original)}>
                <Trash2 className="h-4 w-4" />删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    );
    return cols;
  }, [kind, onRename, onToggle, onDelete]);

  return <DataTable columns={columns} data={rows} />;
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
  const [importApp, setImportApp] = useState<CCSwitchApp>('claude');
  const [importExpanded, setImportExpanded] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const open = data !== null;
  // 模型列表（弹窗打开时拉取）
  const { data: models, loading: modelsLoading } = useAsync(
    () => (open ? getPanelModelsApi({ size: 200, sort: 'created_at' }) : Promise.resolve(null)),
    [open],
  );
  const modelList = models?.list ?? [];
  const [selectedModel, setSelectedModel] = useState('');
  useEffect(() => {
    // 默认选第一个可用模型
    if (!selectedModel && modelList.length > 0) setSelectedModel(modelList[0].name);
  }, [modelList, selectedModel]);

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

  const target = TOOL_IMPORT_TARGETS.find((t) => t.app === importApp) ?? TOOL_IMPORT_TARGETS[0];
  const handleImport = () => {
    if (!data) return;
    const link = buildImportDeepLink(target, {
      apiKey: data.key,
      keyName: data.name,
      model: selectedModel,
      currentOrigin: window.location.origin,
    });
    window.location.href = link;
  };

  return (
    <Dialog open={data !== null} onOpenChange={(o) => { if (!o) setConfirmClose(true); }}>
      <DialogContent
        className="max-w-lg"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>密钥已创建</DialogTitle>
          <DialogDescription>
            请立即复制保存，关闭后将不再显示完整密钥。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md border bg-muted px-3 py-2 text-sm">{data?.key}</code>
            <Button type="button" size="icon" variant="outline" onClick={copy} aria-label="复制">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>完整密钥仅此一次展示，请立即复制并妥善保管，切勿分享或泄露。</span>
          </div>
        </div>

        {/* 导入到指定工具（CC Switch）*/}
        <div className="rounded-lg border">
          <button
            type="button"
            onClick={() => setImportExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium hover:bg-accent/50"
          >
            <span>导入到 CC Switch</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${importExpanded ? 'rotate-180' : ''}`} />
          </button>
          {importExpanded && (
            <div className="border-t p-3">
              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                选择默认模型和目标工具，点击后将唤起 CC Switch 并导入对应 provider。
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">默认模型</Label>
                  <SearchableSelect
                    options={modelList.map((m) => ({ value: m.name, label: m.display_name || m.name, hint: m.name, icon: <ModelIcon id={m.name} displayName={m.display_name ?? undefined} size={20} rounded={false} /> }))}
                    value={selectedModel}
                    onChange={setSelectedModel}
                    placeholder={modelsLoading ? '加载中…' : '选择模型'}
                    disabled={modelsLoading || modelList.length === 0}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">指定工具</Label>
                  <Select value={importApp} onValueChange={(v) => setImportApp(v as CCSwitchApp)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TOOL_IMPORT_TARGETS.map((t) => <SelectItem key={t.app} value={t.app}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="button" className="mt-3 w-full" onClick={handleImport} disabled={!selectedModel}>
                <ExternalLink className="mr-2 h-4 w-4" />
                导入 {target.label}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
      {/* 关闭二次确认 */}
      <AlertDialog open={confirmClose} onOpenChange={(o) => !o && setConfirmClose(false)}>
        <AlertDialogContent className="max-w-md py-8">
          <AlertDialogHeader>
            <AlertDialogTitle>确认密钥已保存</AlertDialogTitle>
            <AlertDialogDescription>
              完整密钥关闭后不再展示，请确认已复制并安全存储。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回查看</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmClose(false); onClose(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              我已保存
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
