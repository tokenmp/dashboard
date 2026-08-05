import { useEffect, useState } from 'react';
import { RefreshCw, Search, Plus, MoreVertical, Pencil, Power, Trash2 } from 'lucide-react';
import {
  getDashboardPlansApi,
  createDashboardPlanApi,
  updateDashboardPlanApi,
  updateDashboardPlanStatusApi,
} from '@/api/dashboard';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useMutation } from '@/hooks/useMutation';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DebouncedInput } from '@/components/DebouncedInput';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatNumber } from '@/utils/format';
import type { PlanItem, PlanListQuery, PlanPayload } from '@/types/plan';

const PLAN_TYPES = ['coding', 'token', 'image'] as const;
const CATEGORIES = ['', 'month', 'week', 'day', 'custom'] as const;

function Plans() {
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getDashboardPlansApi, { initial: { size: 20, sort: '-created_at' } as PlanListQuery });
  const { mutate, loading: submitting } = useMutation();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [deleting, setDeleting] = useState<PlanItem | null>(null);

  const onCreate = (body: PlanPayload) =>
    mutate(() => createDashboardPlanApi(body), {
      successMsg: '套餐已创建', onSuccess: () => { setCreateOpen(false); reload(); },
    }).catch(() => {});
  const onUpdate = (id: string, body: PlanPayload) =>
    mutate(() => updateDashboardPlanApi(id, body), {
      successMsg: '已保存', onSuccess: () => { setEditing(null); reload(); },
    }).catch(() => {});
  const onToggle = (p: PlanItem) =>
    mutate(() => updateDashboardPlanStatusApi(p.id, { status: p.status === 'active' ? 'disabled' : 'active' }), {
      successMsg: p.status === 'active' ? '已下架' : '已上架', onSuccess: () => reload(),
    }).catch(() => {});
  const onDelete = () => {
    if (!deleting) return;
    mutate(() => updateDashboardPlanStatusApi(deleting.id, { status: 'deleted' }), {
      successMsg: '已删除（关联的用户套餐已停用）', onSuccess: () => { setDeleting(null); reload(); },
    }).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">套餐管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">套餐目录（模板）· 共 {formatNumber(total)} 个</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" />新建套餐</Button>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs text-muted-foreground">名称搜索</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <DebouncedInput className="pl-8" placeholder="搜索套餐名"
                value={params.keyword ?? ''}
                onDebouncedChange={(v) => setFilters({ keyword: v })} />
            </div>
          </div>
          <div className="w-[120px]">
            <label className="mb-1 block text-xs text-muted-foreground">类型</label>
            <Select value={params.plan_type ?? 'all'} onValueChange={(v) => setFilters({ plan_type: v === 'all' ? '' : (v as PlanListQuery['plan_type']) })}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {PLAN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[120px]">
            <label className="mb-1 block text-xs text-muted-foreground">状态</label>
            <Select value={params.status ?? 'all'} onValueChange={(v) => setFilters({ status: v === 'all' ? '' : (v as PlanListQuery['status']) })}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="active">上架</SelectItem>
                <SelectItem value="disabled">下架</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      <Card>
        <CardContent className="p-0">
          {loading && list.length === 0 ? (
            <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : list.length === 0 ? (
            <EmptyState className="mx-4 my-6" title="暂无套餐" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">名称</TableHead>
                  <TableHead className="w-[90px]">类型</TableHead>
                  <TableHead className="w-[70px]">分类</TableHead>
                  <TableHead className="text-right w-[110px]">5h/周/月</TableHead>
                  <TableHead className="text-right w-[110px]">Token 额度</TableHead>
                  <TableHead className="text-right w-[80px]">价格</TableHead>
                  <TableHead className="w-[80px]">有效期</TableHead>
                  <TableHead className="w-[80px]">状态</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{p.plan_type}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.category ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {p.plan_type === 'coding'
                        ? `${p.hourly_5h_limit ?? '-'}/${p.weekly_limit ?? '-'}/${p.monthly_limit ?? '-'}`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {p.plan_type === 'token' ? formatNumber(p.token_limit ?? 0) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">¥{p.price}</TableCell>
                    <TableCell className="text-xs">{p.default_duration_days ? `${p.default_duration_days}天` : '永久'}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing(p)}><Pencil className="h-4 w-4" />编辑</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onToggle(p)}>
                            <Power className="h-4 w-4" />{p.status === 'active' ? '下架' : '上架'}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(p)}>
                            <Trash2 className="h-4 w-4" />删除（级联停用）
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>第 {page} / {Math.max(1, Math.ceil(total / size))} 页 · 每页 {size} 条</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / size) || loading} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      )}

      <PlanDialog open={createOpen} submitting={submitting} onClose={() => setCreateOpen(false)} onSubmit={onCreate} />
      <PlanDialog plan={editing} submitting={submitting} onClose={() => setEditing(null)} onSubmit={(body) => { if (editing) onUpdate(editing.id, body); }} />
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除套餐「{deleting?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              软删除（status=deleted）后，所有引用此模板且 active 的用户套餐将被级联停用。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** 新建/编辑套餐弹窗 */
function PlanDialog({ plan, open, submitting, onClose, onSubmit }: {
  plan?: PlanItem | null;
  open?: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (body: PlanPayload) => Promise<unknown> | void;
}) {
  const isEdit = plan !== undefined && plan !== null;
  const visible = plan !== undefined ? isEdit : open;
  const [name, setName] = useState('');
  const [planType, setPlanType] = useState<'coding' | 'token' | 'image'>('coding');
  const [h5h, setH5h] = useState('');
  const [week, setWeek] = useState('');
  const [month, setMonth] = useState('');
  const [token, setToken] = useState('');
  const [price, setPrice] = useState('0');
  const [duration, setDuration] = useState('');
  const [category, setCategory] = useState('');
  const [models, setModels] = useState('');
  useEffect(() => {
    if (!visible) return;
    setName(plan?.name ?? '');
    setPlanType(plan?.plan_type ?? 'coding');
    setH5h(plan?.hourly_5h_limit?.toString() ?? '');
    setWeek(plan?.weekly_limit?.toString() ?? '');
    setMonth(plan?.monthly_limit?.toString() ?? '');
    setToken(plan?.token_limit?.toString() ?? '');
    setPrice(plan?.price?.toString() ?? '0');
    setDuration(plan?.default_duration_days?.toString() ?? '');
    setCategory(plan?.category ?? '');
    setModels((plan?.allowed_model_names ?? []).join(','));
  }, [visible, plan]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: PlanPayload = {
      name: name.trim(),
      plan_type: planType,
      hourly_5h_limit: h5h === '' ? null : Number(h5h),
      weekly_limit: week === '' ? null : Number(week),
      monthly_limit: month === '' ? null : Number(month),
      token_limit: token === '' ? null : Number(token),
      price: Number(price) || 0,
      status: 'active',
      default_duration_days: duration === '' ? null : Number(duration),
      allowed_model_names: planType === 'coding'
        ? models.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      category: category.trim() === '' ? null : category.trim(),
    };
    onSubmit(body);
  };

  return (
    <Dialog open={visible} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑套餐' : '新建套餐'}</DialogTitle>
          <DialogDescription>仅 status=active 的模板可被发放/续期。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>套餐名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 Coding 专业版" autoFocus required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>计费类型</Label>
              <Select value={planType} onValueChange={(v) => setPlanType(v as typeof planType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PLAN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>分类（展示用）</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="无" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c === '' ? '无' : c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {planType === 'coding' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>5h 限额</Label><Input type="number" value={h5h} onChange={(e) => setH5h(e.target.value)} placeholder="不限" /></div>
              <div className="space-y-1.5"><Label>周限额</Label><Input type="number" value={week} onChange={(e) => setWeek(e.target.value)} placeholder="不限" /></div>
              <div className="space-y-1.5"><Label>月/总限额</Label><Input type="number" value={month} onChange={(e) => setMonth(e.target.value)} placeholder="不限" /></div>
            </div>
          )}
          {planType === 'token' && (
            <div className="space-y-1.5"><Label>Token 额度</Label><Input type="number" value={token} onChange={(e) => setToken(e.target.value)} placeholder="不限" /></div>
          )}
          {planType === 'coding' && (
            <div className="space-y-1.5">
              <Label>模型白名单</Label>
              <Input value={models} onChange={(e) => setModels(e.target.value)} placeholder="逗号分隔，如 glm-5.2,claude-sonnet（留空=不限模型）" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>价格 (¥)</Label><Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>默认有效天数</Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="留空=永久" /></div>
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

export default Plans;
