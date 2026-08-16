import { useState } from 'react';
import { RefreshCw, Plus, Pencil, Trash2, Power } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MobileCard,
  MobilePageHeader,
  FilterChip,
  FilterChipRow,
  type MobileCardField,
} from '@/components/mobile';
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
import { formatDate, formatDateTime } from '@/utils/format';
import { CreateKeyDialog, RevealKeyDialog, RenameDialog, type Kind, type KeyRow } from './Keys';

/** 「我的密钥」移动端视图：FilterChip 切换类型/状态 + MobileCard 卡片流（数据 hooks/API 与桌面一致） */
export function KeysMobile() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [apiKeys, botKeys] = await Promise.all([getPanelKeysApi(), getPanelBotKeysApi()]);
    return { apiKeys, botKeys };
  });
  const [kind, setKind] = useState<Kind>('api');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    mutate(() => (kind === 'api' ? createPanelKeyApi({ name }) : createPanelBotKeyApi({ name })), {
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

  const onToggle = (rowKind: Kind, row: KeyRow) =>
    mutate(
      () => (rowKind === 'api'
        ? updatePanelKeyApi(row.id, { status: row.status === 'active' ? 'disabled' : 'active' })
        : updatePanelBotKeyApi(row.id, { status: row.status === 'active' ? 'disabled' : 'active' })),
      { successMsg: row.status === 'active' ? '已停用' : '已启用', onSuccess: () => reload() },
    ).catch(() => {});

  const onDelete = () => {
    if (!deleting) return;
    const { kind: rowKind, row } = deleting;
    mutate(
      () => (rowKind === 'api' ? deletePanelKeyApi(row.id) : deletePanelBotKeyApi(row.id)),
      { successMsg: '已删除', onSuccess: () => { setDeleting(null); reload(); } },
    ).catch(() => {});
  };

  const allRows = kind === 'api' ? apiRows : botRows;
  // 状态筛选为移动端本地的客户端过滤（启用/禁用沿用页面真实状态值）
  const rows = statusFilter === 'all' ? allRows : allRows.filter((r) => r.status === statusFilter);

  return (
    <div className="space-y-3">
      <MobilePageHeader
        title="我的密钥"
        action={
          <div className="flex gap-1.5">
            <Button size="sm" className="h-[30px] gap-1 rounded-lg px-2.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />新建密钥
            </Button>
            <Button variant="outline" size="sm" className="h-[30px] w-[30px] rounded-lg p-0" onClick={reload} disabled={loading} aria-label="刷新">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />

      {error && (
        <Card className="border-destructive"><CardContent className="py-2.5 text-[13px] text-destructive">{error}</CardContent></Card>
      )}

      <FilterChipRow>
        <FilterChip
          label="类型"
          value={kind}
          onChange={(v) => setKind(v as Kind)}
          allValue="api"
          options={[
            { value: 'api', label: apiRows.length > 0 ? `API Key (${apiRows.length})` : 'API Key' },
            { value: 'bot', label: botRows.length > 0 ? `Bot Key (${botRows.length})` : 'Bot Key' },
          ]}
        />
        <FilterChip
          label="状态"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: '全部' },
            { value: 'active', label: '启用' },
            { value: 'disabled', label: '禁用' },
          ]}
        />
      </FilterChipRow>

      {loading ? (
        <div className="space-y-[7px]">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        allRows.length === 0 ? (
          <EmptyState title={`暂无${kind === 'api' ? ' API Key' : ' Bot Key'}`} description="点击右上角「新建密钥」生成一把密钥" />
        ) : (
          <EmptyState title="没有符合筛选的密钥" description="试试切换状态筛选条件" />
        )
      ) : (
        <div className="space-y-[7px]">
          {rows.map((row) => (
            <KeyCard
              key={row.id}
              kind={kind}
              row={row}
              expanded={expandedId === row.id}
              onToggleExpand={() => setExpandedId(expandedId === row.id ? null : row.id)}
              onRename={(r) => setRenaming({ kind, row: r })}
              onToggle={(r) => onToggle(kind, r)}
              onDelete={(r) => setDeleting({ kind, row: r })}
            />
          ))}
        </div>
      )}

      {/* 弹窗全部复用桌面文件中的组件 */}
      <CreateKeyDialog open={createOpen} kind={kind} submitting={submitting} onClose={() => setCreateOpen(false)} onSubmit={onCreate} />
      <RevealKeyDialog data={revealed} onClose={() => setRevealed(null)} />
      <RenameDialog state={renaming} submitting={submitting} onClose={() => setRenaming(null)} onSubmit={onRename} />
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除密钥？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除「{deleting?.row.name}」（{deleting?.row.prefix}***{deleting?.row.suffix}）。删除后使用该密钥的请求将立即失败，且无法恢复。
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

/** 单张密钥卡片：点卡片展开操作（默认无按钮，避免密钥多时满屏按钮）。
 *  名称前状态点（绿=启用/红=禁用）；密钥片段星号脱敏，不可复制。 */
function KeyCard({
  kind,
  row,
  expanded,
  onToggleExpand,
  onRename,
  onToggle,
  onDelete,
}: {
  kind: Kind;
  row: KeyRow;
  expanded: boolean;
  onToggleExpand: () => void;
  onRename: (row: KeyRow) => void;
  onToggle: (row: KeyRow) => void;
  onDelete: (row: KeyRow) => void;
}) {
  // 字段为页面真实表格列：Bot Key 多一列「权限」，其余与 API Key 一致
  const fields: MobileCardField[] = [
    ...(kind === 'bot' ? [{ key: 'scope', label: '权限', value: row.scope ?? '—' }] : []),
    { key: 'lastUsed', label: '最近使用', value: row.lastUsed ? formatDateTime(row.lastUsed) : '未使用' },
    { key: 'createdAt', label: '创建时间', value: formatDate(row.createdAt) },
  ];

  return (
    <MobileCard
      title={
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-label={row.status === 'active' ? '启用' : '禁用'}
            className={row.status === 'active' ? 'shrink-0 text-emerald-500' : 'shrink-0 text-red-500'}
          >
            ●
          </span>
          <span className="truncate">{row.name || '—'}</span>
        </span>
      }
      subtitle={<span className="truncate font-mono">{row.prefix}***{row.suffix}</span>}
      fields={fields}
      onClick={onToggleExpand}
      actions={
        expanded ? (
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 flex-1 gap-1 rounded-lg px-2 text-[11.5px]" onClick={() => onRename(row)}>
              <Pencil className="h-3.5 w-3.5" />改名
            </Button>
            <Button variant="outline" size="sm" className="h-7 flex-1 gap-1 rounded-lg px-2 text-[11.5px]" onClick={() => onToggle(row)}>
              <Power className="h-3.5 w-3.5" />{row.status === 'active' ? '停用' : '启用'}
            </Button>
            <Button variant="outline" size="sm" className="h-7 flex-1 gap-1 rounded-lg px-2 text-[11.5px] text-destructive hover:text-destructive" onClick={() => onDelete(row)}>
              <Trash2 className="h-3.5 w-3.5" />删除
            </Button>
          </div>
        ) : undefined
      }
    />
  );
}
