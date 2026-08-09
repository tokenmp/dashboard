import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAsync } from '@/hooks/useAsync';
import {
  getDashboardPriceRulesApi,
  createDashboardPriceRuleApi,
  updateDashboardPriceRuleApi,
  updateDashboardPriceRuleStatusApi,
  deleteDashboardPriceRuleApi,
  getDashboardProvidersApi,
  getDashboardModelsApi,
} from '@/api/dashboard';
import type { PriceRuleItem } from '@/types/usage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';

type Side = 'upstream' | 'user';

interface EditState {
  id?: string;
  side: Side;
  provider_id: string;
  model_id: string;
  multiplier: string;
  priority: string;
}

const EMPTY: EditState = { side: 'user', provider_id: '', model_id: '', multiplier: '1', priority: '0' };

export default function PriceRules() {
  const [sideFilter, setSideFilter] = useState<string>('');
  const { list, total, page, size, loading, reload, setPage } = usePagedQuery(
    (p) => getDashboardPriceRulesApi({ ...p, ...(sideFilter ? { side: sideFilter } : {}) }),
    { initial: { size: 20, sort: 'priority' } },
  );
  const { data: providers } = useAsync(() => getDashboardProvidersApi({ size: 200 }).then((r) => r.list), []);
  const { data: models } = useAsync(() => getDashboardModelsApi({ size: 500 }).then((r) => r.list), []);

  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PriceRuleItem | null>(null);

  const submit = async () => {
    if (!edit) return;
    if (!edit.provider_id) return toast.error('请选择供应商');
    const m = Number(edit.multiplier);
    if (!(m > 0)) return toast.error('倍率须大于 0');
    const payload = {
      side: edit.side,
      provider_id: edit.provider_id,
      model_id: edit.model_id || null,
      multiplier: m,
      priority: Number(edit.priority) || 0,
    };
    setSaving(true);
    try {
      if (edit.id) await updateDashboardPriceRuleApi(edit.id, payload);
      else await createDashboardPriceRuleApi(payload);
      toast.success(edit.id ? '已更新' : '已创建');
      setEdit(null);
      reload();
    } catch (e) {
      toast.error((e as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteDashboardPriceRuleApi(pendingDelete.id);
      toast.success('已删除');
      setPendingDelete(null);
      reload();
    } catch (e) {
      toast.error((e as Error).message || '删除失败');
    }
  };

  const providerName = (id: string | null) => providers?.find((p) => p.id === id)?.display_name || providers?.find((p) => p.id === id)?.name || '—';
  const modelName = (id: string | null) => models?.find((m) => m.id === id)?.display_name || models?.find((m) => m.id === id)?.name || (id ? id.slice(-8) : '全部模型');

  const columns = useMemo<ColumnDef<PriceRuleItem>[]>(() => [
    {
      accessorKey: 'side',
      header: ({ column }) => <DataTableColumnHeader column={column} title="类型" />,
      cell: ({ row }) => <Badge variant={row.original.side === 'upstream' ? 'secondary' : 'outline'} className="text-[10px]">{row.original.side === 'upstream' ? '上游成本' : '用户扣费'}</Badge>,
    },
    {
      id: 'provider',
      header: () => <span className="text-xs font-medium text-muted-foreground">供应商</span>,
      cell: ({ row }) => <span className="text-sm">{providerName(row.original.provider_id)}</span>,
    },
    {
      id: 'model',
      header: () => <span className="text-xs font-medium text-muted-foreground">模型</span>,
      cell: ({ row }) => <span className="text-sm">{row.original.model_id ? modelName(row.original.model_id) : <span className="text-muted-foreground">全部</span>}</span>,
    },
    {
      accessorKey: 'multiplier',
      meta: { className: 'text-right' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="倍率" />,
      cell: ({ row }) => <span className="block text-right font-mono text-sm">×{row.original.multiplier}</span>,
    },
    {
      accessorKey: 'priority',
      meta: { className: 'text-right' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="优先级" />,
      cell: ({ row }) => <span className="block text-right text-sm text-muted-foreground">{row.original.priority}</span>,
    },
    {
      id: 'status',
      header: () => <span className="text-xs font-medium text-muted-foreground">状态</span>,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <Button variant="ghost" size="sm" className="h-7 text-xs"
            onClick={async () => { await updateDashboardPriceRuleStatusApi(r.id, r.status === 'active' ? 'disabled' : 'active'); reload(); }}>
            {r.status === 'active' ? <span className="text-emerald-600">启用</span> : <span className="text-muted-foreground">禁用</span>}
          </Button>
        );
      },
    },
    {
      id: 'action',
      meta: { className: 'text-right' },
      header: () => null,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" title="编辑"
              onClick={() => setEdit({ id: r.id, side: r.side, provider_id: r.provider_id ?? '', model_id: r.model_id ?? '', multiplier: String(r.multiplier), priority: String(r.priority) })}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" title="删除" onClick={() => setPendingDelete(r)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ], [providers, models]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">请求倍率</h1>
        <Button onClick={() => setEdit({ ...EMPTY })}><Plus className="mr-1 h-4 w-4" />新建规则</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        按「供应商」或「供应商+模型」配置扣费倍率，区分上游成本与用户扣费。映射自动继承生效值。
      </p>

      <div className="flex items-center gap-2">
        <Select value={sideFilter || 'all'} onValueChange={(v) => { setSideFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="全部类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="user">用户扣费</SelectItem>
            <SelectItem value="upstream">上游成本</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading && list.length === 0 ? null
        : <DataTable columns={columns} data={list} emptyComponent={<EmptyState className="mx-4 my-6" title="暂无规则" description="点击右上角新建" />} />}

      {total > size && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
          <span className="self-center text-sm text-muted-foreground">第 {page} 页</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / size)} onClick={() => setPage(page + 1)}>下一页</Button>
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{edit?.id ? '编辑规则' : '新建规则'}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">类型</label>
                <Select value={edit.side} onValueChange={(v) => setEdit({ ...edit, side: v as Side })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">用户扣费</SelectItem>
                    <SelectItem value="upstream">上游成本</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">供应商</label>
                <Select value={edit.provider_id} onValueChange={(v) => setEdit({ ...edit, provider_id: v, model_id: '' })}>
                  <SelectTrigger><SelectValue placeholder="选择供应商" /></SelectTrigger>
                  <SelectContent>
                    {(providers ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.display_name || p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">模型（留空=该供应商全部模型）</label>
                <Select value={edit.model_id || '__all__'} onValueChange={(v) => setEdit({ ...edit, model_id: v === '__all__' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="全部模型" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">全部模型</SelectItem>
                    {(models ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name || m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">倍率</label>
                  <Input type="number" step="0.0001" min="0" value={edit.multiplier} onChange={(e) => setEdit({ ...edit, multiplier: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">优先级</label>
                  <Input type="number" value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>取消</Button>
            <Button disabled={saving} onClick={submit}>{saving ? '保存中…' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="删除规则"
        description={pendingDelete ? `确认删除该倍率规则（×${pendingDelete.multiplier}）？` : ''}
        confirmText="删除"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
