import { useMemo, useState } from 'react';
import { RefreshCw, Plus, MoreVertical, Pencil, Trash2, Power, ChevronRight } from 'lucide-react';
import {
  getPanelUpstreamKeysApi,
  updatePanelUpstreamKeyStatusApi,
  deletePanelUpstreamKeyApi,
} from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { useMutation } from '@/hooks/useMutation';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/utils/format';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { UpstreamMobile } from './Upstream.mobile';
import { BillingModeBadge, VerifiedCell, CreateUpstreamKeyDialog, EditUpstreamKeyDialog, UpstreamKeyDetailDialog } from './Upstream.shared';
import type { UpstreamKeyItem } from '@/types/upstream';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** 「我的上游」桌面视图 */
function UpstreamDesktop() {
  const { data, loading, error, reload } = useAsync(() => getPanelUpstreamKeysApi({ size: 100, sort: '-created_at' }));
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UpstreamKeyItem | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<UpstreamKeyItem | null>(null);
  const { loading: submitting, mutate } = useMutation();

  const keys = data?.list ?? [];

  const onToggle = (row: UpstreamKeyItem) =>
    mutate(() => updatePanelUpstreamKeyStatusApi(row.id, row.status === 'active' ? 'disabled' : 'active'), {
      successMsg: row.status === 'active' ? '已停用' : '已启用',
      onSuccess: () => reload(),
    }).catch(() => {});

  const onDelete = () => {
    if (!deleting) return;
    mutate(() => deletePanelUpstreamKeyApi(deleting.id), {
      successMsg: '已删除',
      onSuccess: () => { setDeleting(null); reload(); },
    }).catch(() => {});
  };

  const columns = useMemo<ColumnDef<UpstreamKeyItem>[]>(() => [
    {
      accessorKey: 'name',
      meta: { className: 'w-[20%]' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="名称" />,
      cell: ({ row }) => (
        <button type="button" className="flex items-center gap-1.5 text-left font-medium hover:underline" onClick={() => setDetailId(row.original.id)}>
          {row.original.name || '—'}<ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      ),
    },
    {
      id: 'provider',
      meta: { className: 'w-[14%]' },
      header: () => <span className="text-xs font-medium text-muted-foreground">供应商</span>,
      cell: ({ row }) => <span className="text-sm">{row.original.provider?.display_name || row.original.provider?.name || '—'}</span>,
    },
    {
      id: 'key',
      header: () => <span className="text-xs font-medium text-muted-foreground">密钥</span>,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.key_prefix}…{row.original.key_suffix}</span>,
    },
    {
      id: 'billing',
      meta: { className: 'w-[9%]' },
      header: () => <span className="text-xs font-medium text-muted-foreground">计费</span>,
      cell: ({ row }) => <BillingModeBadge mode={row.original.billing_mode} />,
    },
    {
      id: 'status',
      meta: { className: 'w-[9%]' },
      header: () => <span className="text-xs font-medium text-muted-foreground">状态</span>,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'verified',
      meta: { className: 'w-[16%]' },
      header: () => <span className="text-xs font-medium text-muted-foreground">最近探测</span>,
      cell: ({ row }) => <VerifiedCell row={row.original} />,
    },
    {
      accessorKey: 'created_at',
      meta: { className: 'w-[11%]' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="创建时间" />,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{formatDate(row.original.created_at)}</span>,
    },
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
            <DropdownMenuItem onClick={() => setEditing(row.original)}><Pencil className="h-4 w-4" />编辑</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggle(row.original)}>
              <Power className="h-4 w-4" />{row.original.status === 'active' ? '停用' : '启用'}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(row.original)}>
              <Trash2 className="h-4 w-4" />删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [reload, mutate]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">我的上游</h1>
          <p className="mt-1 text-sm text-muted-foreground">自带上游 API Key——创建后优先于平台渠道出流量，模型走同供应商目录</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" />新建</Button>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
          </Button>
        </div>
      </div>

      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : keys.length === 0 ? (
        <EmptyState title="还没有自建上游" description="带上自己的 API Key（如官方/中转站 Key），按所选计费模式出流量；探测确认可用后即可切换模型体验" />
      ) : (
        <DataTable columns={columns} data={keys} />
      )}

      <CreateUpstreamKeyDialog open={createOpen} submitting={submitting} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); reload(); }} />
      <EditUpstreamKeyDialog row={editing} submitting={submitting} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />
      <UpstreamKeyDetailDialog keyId={detailId} onClose={() => setDetailId(null)} onChanged={reload} />
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除自建上游？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除「{deleting?.name}」（{deleting?.key_prefix}…{deleting?.key_suffix}）及其全部模型映射。删除后相关请求将回落到平台渠道。
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

/** 「我的上游」页：按视口分发桌面表格 / 移动卡片流 */
export default function Upstream() {
  const isMobile = useIsMobile();
  return isMobile ? <UpstreamMobile /> : <UpstreamDesktop />;
}
