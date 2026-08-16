import { useEffect, useState } from 'react';
import { RefreshCw, Search, Plus, MoreVertical, Pencil, KeyRound, Power } from 'lucide-react';
import {
  getDashboardUsersApi,
  createDashboardUserApi,
  updateDashboardUserApi,
  resetDashboardUserPasswordApi,
} from '@/api/dashboard';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useUrlQueryState } from '@/hooks/useUrlQueryState';
import { useMutation } from '@/hooks/useMutation';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DebouncedInput } from '@/components/DebouncedInput';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  MobileCard,
  FilterChip,
  FilterChipRow,
  MobilePagination,
  MobilePageHeader,
} from '@/components/mobile';
import type { MobileCardField } from '@/components/mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { formatCompact, formatDate, formatNumber } from '@/utils/format';
import {
  CreateUserDialog,
  EditUserDialog,
  RevealPasswordDialog,
  DetailDrawer,
  GrantPlanButton,
} from './index';
import type { UserBasic, UserListQuery, UserUpdatePayload } from '@/types/user';

/** 角色筛选项（与桌面筛选条一致） */
const ROLE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'admin', label: 'admin' },
  { value: 'user', label: 'user' },
];

/** 状态筛选项（与桌面筛选条一致） */
const STATUS_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '启用' },
  { value: 'disabled', label: '禁用' },
];

/**
 * 管理端·用户管理（移动视图）：搜索框 + 角色/状态 chips + 卡片流 + 紧凑分页。
 * 数据 hooks、筛选状态与写操作与桌面视图完全一致（同一组 URL query 字段），
 * 用户详情抽屉与各弹窗复用 index.tsx 导出的现有组件。
 */
export function UsersAdminMobile() {
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

  // 写操作状态（与桌面一致）
  const { mutate, loading: submitting } = useMutation();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserBasic | null>(null);
  const [resetting, setResetting] = useState<UserBasic | null>(null);
  const [revealed, setRevealed] = useState<{ email: string; password: string } | null>(null);

  // 写操作与桌面视图完全相同
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
    <div className="space-y-3">
      {/* 页头 */}
      <MobilePageHeader
        title="用户管理"
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />新建用户
            </Button>
            <Button variant="outline" size="sm" className="px-2" onClick={reload} disabled={loading} aria-label="刷新">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />

      {/* 搜索邮箱 */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <DebouncedInput
          className="pl-8"
          placeholder="搜索邮箱"
          value={params.keyword ?? ''}
          onDebouncedChange={(v) => setFilters({ keyword: v })}
        />
      </div>

      {/* 高频筛选 chips：角色 / 状态（沿用页面现有筛选状态模型，即选即生效） */}
      <FilterChipRow className="-mx-4">
        <FilterChip
          label="角色"
          options={ROLE_OPTIONS}
          value={params.role ?? ''}
          onChange={(v) => setFilters({ role: v === 'all' ? '' : v })}
        />
        <FilterChip
          label="状态"
          options={STATUS_OPTIONS}
          value={params.status ?? ''}
          onChange={(v) => setFilters({ status: v === 'all' ? '' : v })}
        />
      </FilterChipRow>

      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      {/* 卡片流 */}
      {loading && list.length === 0 ? (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="暂无用户" />
      ) : (
        <div className="space-y-2.5">
          {list.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              onDetail={() => setDetailId(u.id)}
              onEdit={() => setEditing(u)}
              onToggle={() => onToggle(u)}
              onResetPassword={() => setResetting(u)}
              onPlanDone={reload}
            />
          ))}
        </div>
      )}

      {/* 分页 */}
      {total > 0 && <MobilePagination page={page} size={size} total={total} onPageChange={setPage} />}

      {/* 用户详情抽屉（与桌面共用同一 DetailDrawer） */}
      <DetailDrawer id={detailId} onClose={() => setDetailId(null)} />

      {/* 弹窗全部复用桌面文件中的组件；重置密码确认弹窗与桌面同款 */}
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

/* ----------------------------- 用户卡片 ----------------------------- */

/** 单个用户的移动卡片：标题=邮箱、徽标=角色+状态徽标，字段取自页面真实列；点卡开详情，操作区含详情/套餐/启停与更多菜单。 */
function UserCard({
  user,
  onDetail,
  onEdit,
  onToggle,
  onResetPassword,
  onPlanDone,
}: {
  user: UserBasic;
  onDetail: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onResetPassword: () => void;
  onPlanDone: () => void;
}) {
  const plans = user.plans ?? [];
  const usage = user.usage;
  // 字段与桌面列同源：本月用量（次数/Token）、套餐、首选计费、注册时间
  const fields: MobileCardField[] = [
    { key: 'monthRequests', label: '本月请求', value: usage ? `${formatNumber(usage.monthRequests)} 次` : '—' },
    { key: 'monthTokens', label: '本月 Token', value: usage ? formatCompact(usage.monthTokens) : '—' },
    { key: 'plans', label: '套餐', value: plans.length > 0 ? plans.map((p) => p.name).join('、') : '—' },
    { key: 'billing', label: '首选计费', value: user.preferred_billing },
    { key: 'createdAt', label: '注册时间', value: formatDate(user.created_at) },
  ];
  const active = user.status === 'active';

  return (
    <MobileCard
      title={<span className="truncate">{user.email}</span>}
      badge={
        <span className="flex shrink-0 items-center gap-1">
          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">{user.role}</Badge>
          <StatusBadge status={user.status} />
        </span>
      }
      fields={fields}
      onClick={onDetail}
      actions={
        // 阻止操作区点击冒泡触发整卡详情
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={onDetail}>
            详情
          </Button>
          <GrantPlanButton userId={user.id} className="h-7 px-2.5 text-xs" onDone={onPlanDone} />
          <Button
            variant="outline"
            size="sm"
            className={cn('h-7 gap-1 px-2.5 text-xs', active && 'text-destructive hover:bg-destructive/10 hover:text-destructive')}
            onClick={onToggle}
          >
            <Power className="h-3.5 w-3.5" />
            {active ? '禁用' : '启用'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="更多操作">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4" />编辑</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onResetPassword}>
                <KeyRound className="h-4 w-4" />重置密码
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    />
  );
}
