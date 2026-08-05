import { useEffect, useState } from 'react';
import { RefreshCw, Search, ChevronRight, KeyRound, Bot, Package, Plus, MoreVertical, Pencil, Power, Copy, Check } from 'lucide-react';
import {
  getDashboardUsersApi,
  getDashboardUserDetailApi,
  createDashboardUserApi,
  updateDashboardUserApi,
  resetDashboardUserPasswordApi,
  getDashboardPlansApi,
  grantDashboardUserPlanApi,
  renewDashboardUserPlanApi,
  disableDashboardUserPlanApi,
} from '@/api/dashboard';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useUrlQueryState } from '@/hooks/useUrlQueryState';
import { useAsync } from '@/hooks/useAsync';
import { useMutation } from '@/hooks/useMutation';
import { StatusBadge } from '@/components/StatusBadge';
import { QuotaCards } from '@/components/QuotaCards';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DebouncedInput } from '@/components/DebouncedInput';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
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
import { formatNumber } from '@/utils/format';
import { toast } from 'sonner';
import { getApiError } from '@/utils/error';
import type { UserBasic, UserListQuery, UserUpdatePayload } from '@/types/user';

function Users() {
  const [detailId, setDetailId] = useState<string | null>(null);
  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'q', key: 'keyword' },
    { name: 'role', key: 'role' },
    { name: 'status', key: 'status' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getDashboardUsersApi, { initial: { size: 20, sort: '-created_at', ...urlInit } as UserListQuery });
  useEffect(() => { write(params); }, [params]);

  // 写操作状态
  const { mutate, loading: submitting } = useMutation();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserBasic | null>(null);
  const [resetting, setResetting] = useState<UserBasic | null>(null);
  const [revealed, setRevealed] = useState<{ email: string; password: string } | null>(null);

  const onCreate = (email: string, role: string) =>
    mutate(() => createDashboardUserApi({ email, role }), {
      successMsg: '用户已创建',
      onSuccess: (r) => { setCreateOpen(false); setRevealed({ email: r.email, password: r.password }); reload(); },
    }).catch(() => {});

  const onUpdate = (u: UserBasic, patch: UserUpdatePayload) =>
    mutate(() => updateDashboardUserApi(u.id, patch), {
      successMsg: '已保存',
      onSuccess: () => { setEditing(null); reload(); },
    }).catch(() => {});

  const onToggle = (u: UserBasic) =>
    mutate(() => updateDashboardUserApi(u.id, { status: u.status === 'active' ? 'disabled' : 'active' }), {
      successMsg: u.status === 'active' ? '已禁用' : '已启用',
      onSuccess: () => reload(),
    }).catch(() => {});

  const onReset = () => {
    if (!resetting) return;
    mutate(() => resetDashboardUserPasswordApi(resetting.id), {
      successMsg: '密码已重置',
      onSuccess: (r) => { setRevealed({ email: resetting.email, password: r.password }); setResetting(null); },
    }).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">用户管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">全平台用户 · 共 {formatNumber(total)} 人</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" />新建用户</Button>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs text-muted-foreground">邮箱搜索</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <DebouncedInput className="pl-8" placeholder="搜索邮箱"
                value={params.keyword ?? ''}
                onDebouncedChange={(v) => setFilters({ keyword: v })} />
            </div>
          </div>
          <div className="w-[120px]">
            <label className="mb-1 block text-xs text-muted-foreground">角色</label>
            <Select value={params.role ?? 'all'} onValueChange={(v) => setFilters({ role: v === 'all' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
                <SelectItem value="user">user</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-[120px]">
            <label className="mb-1 block text-xs text-muted-foreground">状态</label>
            <Select value={params.status ?? 'all'} onValueChange={(v) => setFilters({ status: v === 'all' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="active">启用</SelectItem>
                <SelectItem value="disabled">禁用</SelectItem>
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
            <EmptyState className="mx-4 my-6" title="暂无用户" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">邮箱</TableHead>
                  <TableHead className="w-[90px]">角色</TableHead>
                  <TableHead className="w-[90px]">状态</TableHead>
                  <TableHead className="w-[110px]">首选计费</TableHead>
                  <TableHead className="w-[160px]">注册时间</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((u) => (
                  <TableRow key={u.id} className="cursor-pointer" onClick={() => setDetailId(u.id)}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell><Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">{u.role}</Badge></TableCell>
                    <TableCell><StatusBadge status={u.status} /></TableCell>
                    <TableCell className="text-xs">{u.preferred_billing}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{u.created_at}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailId(u.id)}><ChevronRight className="h-4 w-4" />查看详情</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditing(u)}><Pencil className="h-4 w-4" />编辑</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onToggle(u)}>
                            <Power className="h-4 w-4" />{u.status === 'active' ? '禁用' : '启用'}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setResetting(u)}>
                            <KeyRound className="h-4 w-4" />重置密码
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

      <DetailDrawer id={detailId} onClose={() => setDetailId(null)} />

      <CreateUserDialog open={createOpen} submitting={submitting} onClose={() => setCreateOpen(false)} onSubmit={onCreate} />
      <EditUserDialog user={editing} submitting={submitting} onClose={() => setEditing(null)} onSubmit={onUpdate} />
      <AlertDialog open={resetting !== null} onOpenChange={(o) => !o && setResetting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重置密码？</AlertDialogTitle>
            <AlertDialogDescription>
              将为「{resetting?.email}」生成新的随机密码。该用户的所有登录会话将立即失效，需用新密码重新登录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onReset}>重置</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <RevealPasswordDialog data={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
}

/** 新建用户弹窗 */
function CreateUserDialog({ open, submitting, onClose, onSubmit }: {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (email: string, role: string) => Promise<unknown>;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  useEffect(() => { if (open) { setEmail(''); setRole('user'); } }, [open]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;
    onSubmit(v, role);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新建用户</DialogTitle>
          <DialogDescription>创建后将生成随机临时密码，仅显示一次，请及时转交。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="u-email">邮箱</Label>
            <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" autoFocus required />
          </div>
          <div className="space-y-1.5">
            <Label>角色</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">user（普通用户）</SelectItem>
                <SelectItem value="admin">admin（管理员）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={submitting}>{submitting ? '创建中…' : '创建用户'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 编辑用户弹窗（角色 / 首选计费 / 回退） */
function EditUserDialog({ user, submitting, onClose, onSubmit }: {
  user: UserBasic | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (u: UserBasic, patch: UserUpdatePayload) => Promise<unknown>;
}) {
  const [role, setRole] = useState('user');
  const [billing, setBilling] = useState('coding');
  const [fallback, setFallback] = useState(true);
  const open = user !== null;
  useEffect(() => { if (open && user) { setRole(user.role); setBilling(user.preferred_billing); setFallback(user.fallback_enabled); } }, [open, user]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    onSubmit(user, { role, preferred_billing: billing, fallback_enabled: fallback });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>编辑用户</DialogTitle>
          <DialogDescription className="font-mono">{user?.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>角色</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="user">user</SelectItem><SelectItem value="admin">admin</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>首选计费</Label>
            <Select value={billing} onValueChange={setBilling}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="coding">coding</SelectItem><SelectItem value="token">token</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="pr-3">
              <div className="text-sm font-medium">额度回退</div>
              <div className="text-xs text-muted-foreground">首选额度不足时，自动回退另一种计费</div>
            </div>
            <Switch checked={fallback} onCheckedChange={setFallback} />
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

/** 一次性明文密码展示（新建/重置后，仅显示一次 + 复制） */
function RevealPasswordDialog({ data, onClose }: { data: { email: string; password: string } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* 忽略 */ }
  };
  return (
    <Dialog open={data !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>密码已生成</DialogTitle>
          <DialogDescription className="text-destructive">⚠️ 请立即复制保存，关闭后将不再显示。</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{data?.email} 的临时密码</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md border bg-muted px-3 py-2 text-base font-mono tracking-wider">{data?.password}</code>
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

/** 预计到期预览：今天(北京) + N 天 的 23:59:59（与后端 computeExpiresAt 公式一致） */
function previewExpires(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd} 23:59:59（北京时间）`;
}

/** 续期预计到期：基点=max(原到期,今天)，未过期顺延/已过期从今天，+N 天 23:59:59 北京 */
function previewRenew(currentExpiresAt: string | null, days: number): string {
  const todayBeijing = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let baseYmd: string;
  let baseKind: string;
  if (currentExpiresAt) {
    const expiresYmd = currentExpiresAt.slice(0, 10);
    if (todayBeijing <= expiresYmd) {
      baseYmd = expiresYmd;
      baseKind = '未过期·从原到期日顺延';
    } else {
      baseYmd = todayBeijing;
      baseKind = '已过期·从今天起算';
    }
  } else {
    baseYmd = todayBeijing;
    baseKind = '当前永久·从今天起算';
  }
  const [y, m, d] = baseYmd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd} 23:59:59（${baseKind}）`;
}

function RenewPlanDialog({ userId, target, onOpenChange, onDone }: {
  userId: string;
  target: { planId: string; name: string; expiresAt: string | null } | null;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const { mutate, loading: submitting } = useMutation();
  const [days, setDays] = useState('31');
  const [permanent, setPermanent] = useState(false);

  // 打开时重置输入
  useEffect(() => {
    if (target) { setDays('31'); setPermanent(false); }
  }, [target]);

  const open = target !== null;
  const currentLabel = target?.expiresAt
    ? `${target.expiresAt.slice(0, 10)} 23:59:59（北京时间）`
    : '永久有效';
  const preview = permanent
    ? '永久有效'
    : days ? previewRenew(target?.expiresAt ?? null, Number(days)) : '请输入天数';

  const submit = () => {
    if (!target) return;
    mutate(() => renewDashboardUserPlanApi(userId, target.planId, {
      duration_days: permanent ? undefined : (days ? Number(days) : undefined),
      permanent,
    }), {
      successMsg: '已续期',
      onSuccess: () => { onOpenChange(false); onDone?.(); },
    }).catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>续期套餐</DialogTitle>
          <DialogDescription>{target?.name ?? '—'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">当前到期：</span>
            <span className="font-medium">{currentLabel}</span>
          </div>
          <div className="space-y-1.5">
            <Label>续期天数</Label>
            <Input type="number" value={days} onChange={(e) => setDays(e.target.value)} disabled={permanent} placeholder="如 31" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={permanent} onCheckedChange={setPermanent} id="renew-perm" />
            <Label htmlFor="renew-perm" className="cursor-pointer">设为永久有效</Label>
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">续期后预计到期：</span>
            <span className="font-medium">{preview}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={submitting || (!permanent && !days)} onClick={submit}>{submitting ? '续期中…' : '确认续期'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GrantPlanButton({ userId, onDone }: { userId: string; onDone?: () => void }) {
  const { mutate, loading: submitting } = useMutation();
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState('');
  const [mode, setMode] = useState<'default' | 'custom' | 'permanent'>('default');
  const [days, setDays] = useState('');
  const [options, setOptions] = useState<{ id: string; name: string; plan_type: string; default_duration_days: number | null }[]>([]);

  const openDialog = async () => {
    setOpen(true);
    setPlanId('');
    setMode('default');
    setDays('');
    try {
      const res = await getDashboardPlansApi({ size: 100, status: 'active' });
      setOptions(res.list.map((p) => ({ id: p.id, name: p.name, plan_type: p.plan_type, default_duration_days: p.default_duration_days })));
    } catch {
      /* 加载套餐列表失败时 options 保持空 */
    }
  };
  const submit = () => {
    if (!planId) return;
    mutate(() => grantDashboardUserPlanApi(userId, {
      plan_id: planId,
      duration_days: mode === 'custom' ? (days ? Number(days) : null) : undefined,
      permanent: mode === 'permanent',
    }), {
      successMsg: '套餐已发放',
      onSuccess: () => { setOpen(false); onDone?.(); },
    }).catch(() => {});
  };

  const selected = options.find((o) => o.id === planId);
  const previewText = (() => {
    if (!planId) return '';
    if (mode === 'permanent') return '永久有效';
    if (mode === 'custom') {
      if (!days) return '请输入天数';
      return previewExpires(Number(days));
    }
    const d = selected?.default_duration_days ?? null;
    return d === null ? '永久有效（模板未设默认天数）' : previewExpires(d);
  })();

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog}><Plus className="mr-1 h-3 w-3" />发放套餐</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>发放套餐</DialogTitle>
            <DialogDescription>token 类型将自动停用该用户旧的 token 套餐（互斥）；coding/image 可叠加。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>选择套餐模板</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger><SelectValue placeholder="选择上架套餐" /></SelectTrigger>
                <SelectContent>
                  {options.map((o) => <SelectItem key={o.id} value={o.id}>[{o.plan_type}] {o.name}{o.default_duration_days != null ? `（默认 ${o.default_duration_days} 天）` : '（永久）'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>有效期</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">按模板默认天数</SelectItem>
                  <SelectItem value="custom">自定义天数</SelectItem>
                  <SelectItem value="permanent">永久</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === 'custom' && (
              <div className="space-y-1.5"><Label>天数</Label><Input type="number" value={days} onChange={(e) => setDays(e.target.value)} placeholder="如 31" /></div>
            )}
            {previewText && (
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                <span className="text-muted-foreground">预计到期：</span>
                <span className="font-medium">{previewText}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button disabled={!planId || submitting} onClick={submit}>{submitting ? '发放中…' : '发放'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, loading, error, reload } = useAsync(
    () => (id ? getDashboardUserDetailApi(id) : Promise.resolve(null)),
    [id],
  );
  const [renewTarget, setRenewTarget] = useState<{ planId: string; name: string; expiresAt: string | null } | null>(null);
  const todayBeijing = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const activePlans = (data?.plans ?? []).filter((p) => p.status === 'active');
  const isPlanExpired = (expiresAt: string | null) => (expiresAt ? todayBeijing > expiresAt.slice(0, 10) : false);
  const effectiveCount = activePlans.filter((p) => !isPlanExpired(p.expires_at)).length;
  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>用户详情</SheetTitle></SheetHeader>
        {id === null ? null : loading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : data ? (
          <div className="space-y-4 p-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">基本信息</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Row label="邮箱" value={data.user.email} />
                  <Row label="角色" value={<Badge variant={data.user.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">{data.user.role}</Badge>} />
                  <Row label="状态" value={<StatusBadge status={data.user.status} />} />
                  <Row label="首选计费" value={data.user.preferred_billing} />
                  <Row label="回退计费" value={data.user.fallback_enabled ? '是' : '否'} />
                  <Row label="注册时间" value={<span className="font-mono text-xs">{data.user.created_at}</span>} />
                </dl>
              </CardContent>
            </Card>

            {data.quota.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">额度</CardTitle></CardHeader>
                <CardContent>
                  <QuotaCards items={data.quota} />
                </CardContent>
              </Card>
            )}

            <KeySection icon={<Bot className="h-3 w-3" />} title="Bot Key" items={data.botKeys.map((k) => ({ id: k.id, name: k.name, masked: `${k.key_prefix}…${k.key_suffix}`, status: k.status, sub: `scope: ${k.scope}` }))} />

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Package className="h-3 w-3" />持有套餐（生效中 {effectiveCount}）
                </CardTitle>
                <GrantPlanButton userId={id} onDone={reload} />
              </CardHeader>
              <CardContent className="space-y-2">
                {activePlans.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">暂无生效套餐，点击「发放套餐」添加</p>
                ) : (
                  activePlans.map((p) => {
                    const expired = isPlanExpired(p.expires_at);
                    return (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border p-2.5">
                      <div>
                        <div className="text-sm font-medium flex items-center gap-2">
                          {p.plan?.name ?? '—'}
                          {expired
                            ? <Badge variant="destructive" className="text-[10px]">已过期</Badge>
                            : <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">生效中</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.plan_type} · 生效 {p.activated_at?.slice(0, 10)} · 过期 {p.expires_at?.slice(0, 10) ?? '永久'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.status === 'active' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setRenewTarget({ planId: p.id, name: p.plan?.name ?? '—', expiresAt: p.expires_at })}>续期…</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={async () => {
                                if (!window.confirm('停用此套餐绑定？')) return;
                                try { await disableDashboardUserPlanApi(id, p.id); reload(); toast.success('已停用'); }
                                catch (e) { toast.error(getApiError(e)); }
                              }}>停用</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
            <RenewPlanDialog userId={id} target={renewTarget} onOpenChange={(o) => !o && setRenewTarget(null)} onDone={reload} />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b border-dashed py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function KeySection({ icon, title, items }: { icon: React.ReactNode; title: string; items: { id: string; name: string; masked: string; status: string; sub: string }[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5">{icon}{title}（{items.length}）</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.map((k) => (
          <div key={k.id} className="flex items-center justify-between rounded-lg border p-2.5">
            <div>
              <div className="text-sm font-medium">{k.name}</div>
              <div className="font-mono text-xs text-muted-foreground">{k.masked}</div>
              <div className="text-xs text-muted-foreground">{k.sub}</div>
            </div>
            <StatusBadge status={k.status} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default Users;
