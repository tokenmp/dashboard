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
  timezone: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  // datetime-local 输入值（浏览器本地墙上时间），提交时转绝对时刻
  effective_from: string;
  effective_until: string;
}

const EMPTY: EditState = {
  side: 'user',
  provider_id: '',
  model_id: '',
  multiplier: '1',
  priority: '0',
  timezone: 'Asia/Shanghai',
  days_of_week: [],
  start_time: '00:00',
  end_time: '24:00',
  effective_from: '',
  effective_until: '',
};

/** 常用时区快捷项；不在列表内的时区走「自定义」文本输入。名字须为 PG 认可的 IANA 名。 */
const TZ_OPTIONS = [
  'Asia/Shanghai',
  'UTC',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
];

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ISO（带偏移）→ datetime-local 输入值（浏览器本地墙上时间）。经绝对时刻换算，与浏览器时区无关地正确。 */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** datetime-local 输入值 → ISO 绝对时刻；空串 → null。 */
function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 星期展示：空=每天；工作日/周末整段合并；否则逐项列出 */
function daysLabel(days: number[]): string {
  if (days.length === 0) return '每天';
  const set = new Set(days);
  const is = (a: number[]) => a.every((d) => set.has(d)) && a.length === days.length;
  if (is([1, 2, 3, 4, 5])) return '工作日';
  if (is([6, 7])) return '周末';
  return days.map((d) => WEEKDAYS[d - 1] ?? d).join('、');
}

/** 时间窗展示——按规则自带时区原样显示，绝不换算（执行端以同一时区求值） */
function windowText(r: PriceRuleItem): string {
  const days = daysLabel(r.days_of_week ?? []);
  const fullDay = r.start_time === '00:00' && (r.end_time === '24:00' || r.end_time === '23:59');
  if (fullDay) return `${days} 全天`;
  return `${days} ${r.start_time}–${r.end_time}（${r.timezone}）`;
}

function effectiveText(r: PriceRuleItem): string {
  const from = r.effective_from ? r.effective_from.replace('T', ' ') : null;
  const until = r.effective_until ? r.effective_until.replace('T', ' ') : null;
  if (!from && !until) return '长期';
  if (!until) return `${from} 起`;
  if (!from) return `至 ${until}`;
  return `${from} ~ ${until}`;
}

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
    if (!edit.timezone.trim()) return toast.error('请填写时区');
    const m = Number(edit.multiplier);
    if (!(m > 0)) return toast.error('倍率须大于 0');
    if (!HHMM.test(edit.start_time)) return toast.error('起始时间须为 HH:MM');
    if (edit.end_time !== '24:00' && !HHMM.test(edit.end_time)) return toast.error('结束时间须为 HH:MM 或 24:00');
    if (edit.start_time === edit.end_time) return toast.error('起止时间不能相等（全天请填 00:00–24:00）');
    const payload = {
      side: edit.side,
      provider_id: edit.provider_id,
      model_id: edit.model_id || null,
      multiplier: m,
      priority: Number(edit.priority) || 0,
      timezone: edit.timezone.trim(),
      days_of_week: [...edit.days_of_week].sort((a, b) => a - b),
      start_time: edit.start_time,
      end_time: edit.end_time,
      effective_from: localInputToIso(edit.effective_from),
      effective_until: localInputToIso(edit.effective_until),
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
      id: 'window',
      header: () => <span className="text-xs font-medium text-muted-foreground">时间窗</span>,
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{windowText(row.original)}</span>,
    },
    {
      id: 'effective',
      header: () => <span className="text-xs font-medium text-muted-foreground">生效区间</span>,
      cell: ({ row }) => <span className="text-xs font-mono text-muted-foreground">{effectiveText(row.original)}</span>,
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
              onClick={() => setEdit({
                id: r.id,
                side: r.side,
                provider_id: r.provider_id ?? '',
                model_id: r.model_id ?? '',
                multiplier: String(r.multiplier),
                priority: String(r.priority),
                timezone: r.timezone || 'Asia/Shanghai',
                days_of_week: r.days_of_week ?? [],
                start_time: r.start_time || '00:00',
                end_time: r.end_time || '24:00',
                effective_from: isoToLocalInput(r.effective_from),
                effective_until: isoToLocalInput(r.effective_until),
              })}>
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

  const tzIsPreset = TZ_OPTIONS.includes(edit?.timezone ?? '');
  const toggleDay = (d: number) => {
    if (!edit) return;
    setEdit({
      ...edit,
      days_of_week: edit.days_of_week.includes(d)
        ? edit.days_of_week.filter((x) => x !== d)
        : [...edit.days_of_week, d],
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">请求倍率</h1>
        <Button onClick={() => setEdit({ ...EMPTY })}><Plus className="mr-1 h-4 w-4" />新建规则</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        按「供应商」或「供应商+模型」配置扣费倍率，区分上游成本与用户扣费。时间窗按规则声明的时区（墙上时间）在请求时刻求值。
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{edit?.id ? '编辑规则' : '新建规则'}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="mb-1 block text-xs text-muted-foreground">优先级</label>
                  <Input type="number" value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })} />
                </div>
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
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">倍率</label>
                <Input type="number" step="0.0001" min="0" value={edit.multiplier} onChange={(e) => setEdit({ ...edit, multiplier: e.target.value })} />
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <p className="text-xs font-medium text-muted-foreground">时间窗（按下方时区的墙上时间求值，如 DeepSeek 峰谷=北京时间）</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">时区</label>
                    <Select
                      value={tzIsPreset ? edit.timezone : '__custom__'}
                      onValueChange={(v) => setEdit({ ...edit, timezone: v === '__custom__' ? '' : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="选择时区" /></SelectTrigger>
                      <SelectContent>
                        {TZ_OPTIONS.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                        <SelectItem value="__custom__">自定义…</SelectItem>
                      </SelectContent>
                    </Select>
                    {!tzIsPreset && (
                      <Input
                        className="mt-2 font-mono text-xs"
                        placeholder="如 Australia/Sydney（IANA 时区名）"
                        value={edit.timezone}
                        onChange={(e) => setEdit({ ...edit, timezone: e.target.value })}
                      />
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">生效星期（全不选=每天）</label>
                    <div className="flex flex-wrap gap-1">
                      {WEEKDAYS.map((label, i) => {
                        const d = i + 1;
                        const on = edit.days_of_week.includes(d);
                        return (
                          <Button
                            key={d}
                            type="button"
                            size="sm"
                            variant={on ? 'default' : 'outline'}
                            className="h-7 px-2 text-xs"
                            onClick={() => toggleDay(d)}
                          >
                            {label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">每日起始（HH:MM）</label>
                    <Input className="font-mono" maxLength={5} placeholder="00:00" value={edit.start_time} onChange={(e) => setEdit({ ...edit, start_time: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">每日结束（HH:MM / 24:00）</label>
                    <Input className="font-mono" maxLength={5} placeholder="24:00" value={edit.end_time} onChange={(e) => setEdit({ ...edit, end_time: e.target.value })} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  全天请填 00:00–24:00；跨午夜窗口（如 22:00–06:00）合法，覆盖起始时刻、不含结束时刻。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">生效起始（留空=立即）</label>
                  <Input type="datetime-local" value={edit.effective_from} onChange={(e) => setEdit({ ...edit, effective_from: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">生效截止（留空=长期）</label>
                  <Input type="datetime-local" value={edit.effective_until} onChange={(e) => setEdit({ ...edit, effective_until: e.target.value })} />
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
