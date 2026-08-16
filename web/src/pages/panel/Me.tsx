import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ShieldCheck, Megaphone, Gift, BookOpen, UserCircle, Gauge, LogOut, ChevronRight, ChevronDown } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useRole } from '@/hooks/useRole';
import { useAuthStore } from '@/store/auth';
import { getPanelNoticesApi, getPanelPlansApi, getPanelUsageQuotaApi } from '@/api/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact, formatNumber } from '@/utils/format';
import { cn } from '@/lib/utils';


/** 重置倒计时（简版，与桌面 QuotaCards 口径一致）：>1 天显示「N天M时」，>1 时「M时S分」，否则「S分 / 即将重置」 */
function formatCountdownShort(ms: number): string {
  if (ms <= 0) return '即将重置';
  const totalMin = Math.floor(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return m > 0 || h > 0 ? `${d}天${h}时` : `${d}天`;
  if (h > 0) return `${h}时${m}分`;
  return m > 0 ? `${m}分` : '即将重置';
}

/** 「我的」页入口行（icon 底色 + 标题/副标题 + 右箭头） */
function MeCell({
  to,
  icon: Icon,
  iconClass,
  title,
  subtitle,
  danger,
}: {
  to?: string;
  icon: typeof Megaphone;
  iconClass: string;
  title: string;
  subtitle?: string;
  danger?: boolean;
}) {
  const body = (
    <>
      <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg', iconClass)}>
        <Icon className="h-[15px] w-[15px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[12.5px] font-medium', danger && 'font-semibold text-destructive')}>
          {title}
        </span>
        {subtitle && <span className="block truncate text-[10px] text-muted-foreground">{subtitle}</span>}
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
    </>
  );
  const cls = 'flex items-center gap-2.5 px-3 py-2.5';
  return to ? (
    <NavLink to={to} className={cls}>
      {body}
    </NavLink>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** 套餐类型 → 中文标签与徽标配色 */
const PLAN_TYPE_META: Record<string, { label: string; cls: string }> = {
  coding: { label: '编程', cls: 'bg-blue-500/10 text-blue-600' },
  token: { label: 'Token', cls: 'bg-emerald-500/10 text-emerald-600' },
  image: { label: '图像', cls: 'bg-violet-500/10 text-violet-600' },
};

/** 「我的」页（/panel/me，移动端第 5 Tab；桌面亦可访问）。
 * 身份卡 → 我的套餐 → 管理后台（admin 可见）→ 服务入口（公告带最新一条摘要）→ 账户入口 → 登出。 */
function PanelMe() {
  const [plansExpanded, setPlansExpanded] = useState(false);
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const { user } = useRole();

  // 最新一条公告标题作为「公告」入口摘要
  const { data: notices } = useAsync(() => getPanelNoticesApi({ page: 1, size: 1, sort: '-created_at' }), []);
  const latestNotice = notices?.list?.[0];

  // 我的套餐（身份卡下方展示）。收起态固定单行高度：加载中占位、多套餐合并 +N、
  // 空时也是一行提示——高度恒定，加载完成不会推挤下方入口（避免误触公告/兑换码）。
  const { data: plans, loading: plansLoading } = useAsync(getPanelPlansApi, []);
  const activePlans = (plans ?? []).filter((p) => p.status === 'active');
  const firstPlan = activePlans[0];
  const firstPlanMeta = firstPlan
    ? PLAN_TYPE_META[firstPlan.plan?.plan_type ?? ''] ?? { label: firstPlan.plan?.plan_type ?? '套餐', cls: 'bg-muted text-muted-foreground' }
    : null;

  // 套餐用量（与「账单·额度总览」同源 getPanelUsageQuotaApi），展开时按套餐名/类型匹配展示
  const { data: quota } = useAsync(getPanelUsageQuotaApi, []);
  const quotaPlans = quota?.role === 'user' ? quota.plans : [];
  const quotaFor = (up: (typeof activePlans)[number]) =>
    quotaPlans.find((q) => q.planName && q.planName === up.plan?.name) ??
    quotaPlans.find((q) => q.billingPlan === up.plan_type);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="mx-auto max-w-lg">
      {/* 身份卡 */}
      <div className="flex items-center gap-2.5 rounded-xl border p-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-900 to-blue-500 text-[15px] font-bold text-white">
          {(user?.email ?? '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold">{user?.email ?? '—'}</div>
          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-600">
            <ShieldCheck className="h-2.5 w-2.5" />
            {user?.role === 'admin' ? '管理员' : '正式用户'}
          </span>
        </div>
      </div>

      {/* 我的套餐：收起时固定单行高度（加载中/有/无套餐一致，杜绝加载完成推挤下方入口）；
          多套餐时点击区块展开全部（高度变化由用户主动触发，与密钥卡点卡展开交互一致） */}
      <button
        type="button"
        className="mt-2 block w-full rounded-xl border p-3 text-left active:bg-accent/40"
        onClick={() => setPlansExpanded((v) => !v)}
        disabled={plansLoading || !firstPlan}
        aria-expanded={plansExpanded}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] text-muted-foreground">
            我的套餐{activePlans.length > 1 ? `（${activePlans.length}）` : ''}
          </span>
          {activePlans.length > 1 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              {plansExpanded ? '收起' : '全部'}
              <ChevronDown className={cn('h-3 w-3 transition-transform', plansExpanded && 'rotate-180')} />
            </span>
          )}
        </div>
        {plansLoading ? (
          <div className="mt-1 flex h-7 items-center">
            <Skeleton className="h-4 w-40" />
          </div>
        ) : !firstPlan ? (
          <div className="mt-1 flex h-7 items-center">
            <span className="text-[11.5px] text-muted-foreground">暂无生效套餐 · 可通过兑换码获取</span>
          </div>
        ) : plansExpanded ? (
          <div className="mt-1.5 space-y-2.5">
            {activePlans.map((up) => {
              const meta = PLAN_TYPE_META[up.plan?.plan_type ?? ''] ?? { label: up.plan?.plan_type ?? '套餐', cls: 'bg-muted text-muted-foreground' };
              const q = quotaFor(up);
              return (
                <div key={up.id}>
                  <div className="flex items-center gap-2">
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', meta.cls)}>{meta.label}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium">{up.plan?.name ?? '未命名套餐'}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {up.expires_at ? `有效期至 ${up.expires_at.slice(0, 10)}` : '长期有效'}
                      </div>
                    </div>
                  </div>
                  {/* 用量（与额度总览同源）：次卡=各窗口进度条（5h/周/月由套餐配置决定，全量渲染）；
                      Token 卡=余额。进度条 ≥70% 琥珀、≥90% 红。 */}
                  {q && q.unit === 'requests'
                    ? (q.windows ?? []).map((w) => {
                        const used = w.used ?? 0;
                        const limit = w.limit;
                        const unlimited = limit == null;
                        const pct = unlimited ? 0 : Math.round(Math.min(1, used / limit) * 100);
                        return (
                          <div key={w.key} className="mt-1.5 pl-1">
                            <div className="flex items-center justify-between text-[10.5px]">
                              <span className="text-muted-foreground">{w.label}</span>
                              <span className="tabular-nums text-muted-foreground">
                                已用 <span className="font-semibold text-foreground">{formatNumber(used)}</span>
                                {unlimited ? ' · 不限' : ` / ${formatNumber(limit)}`}
                              </span>
                            </div>
                            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-amber-500' : 'bg-primary',
                                )}
                                style={unlimited ? { width: '100%', opacity: 0.15 } : { width: pct + '%' }}
                              />
                            </div>
                            {!unlimited && (
                              <div className="mt-0.5 flex items-center justify-between text-[9.5px] tabular-nums text-muted-foreground">
                                <span>剩余 {formatNumber(Math.max(0, limit - used))}</span>
                                {w.resetAt && (
                                  <span>
                                    {w.key === 'h5' ? '恢复' : '重置'} · {formatCountdownShort(new Date(w.resetAt).getTime() - Date.now())}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    : q && q.mode === 'balance' ? (
                        /* 纯计量预付费：余额 = 充值 − 已用（后端 balance 分支） */
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-1 text-[10.5px] text-muted-foreground">
                          <span>
                            余额 <span className="font-medium tabular-nums text-foreground">{formatCompact(q.balance ?? q.available ?? 0)}</span> {q.unit}
                            {q.reserved ? <span className="ml-1">（预扣 {formatCompact(q.reserved)}）</span> : null}
                          </span>
                        </div>
                      ) : q && (
                        /* 固定额度套餐（token/image 带 token_limit，后端 capped 分支，无 balance 字段） */
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-1 text-[10.5px] text-muted-foreground">
                          <span>
                            剩余 <span className="font-medium tabular-nums text-foreground">{formatCompact(q.available ?? 0)}</span>
                            <span className="ml-1">/ 总量 {formatCompact(q.total ?? q.limit ?? 0)}</span>
                          </span>
                          <span>
                            已用 <span className="tabular-nums text-foreground">{formatCompact(q.used ?? 0)}</span>
                            {q.reserved ? <span className="ml-1 text-muted-foreground">（预扣 {formatCompact(q.reserved)}）</span> : null}
                          </span>
                        </div>
                      )}
                </div>
              );
            })}
            <NavLink to="/panel/usage" className="flex items-center justify-between border-t pt-2 text-[11px] font-medium text-muted-foreground">
              查看额度总览
              <ChevronRight className="h-3 w-3" />
            </NavLink>
          </div>
        ) : (
          <div className="mt-1 flex h-7 items-center gap-2">
            {firstPlanMeta && (
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', firstPlanMeta.cls)}>
                {firstPlanMeta.label}
              </span>
            )}
            <div className="min-w-0 flex-1 truncate text-[12px]">
              {firstPlan.plan?.name ?? '未命名套餐'}
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                {firstPlan.expires_at ? `至 ${firstPlan.expires_at.slice(0, 10)}` : '长期有效'}
              </span>
            </div>
            {activePlans.length > 1 && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                +{activePlans.length - 1}
              </span>
            )}
          </div>
        )}
      </button>

      {/* admin 专属：管理后台 */}
      {user?.role === 'admin' && (
        <div className="mt-2 rounded-xl border border-dashed border-blue-300 bg-blue-500/5">
          <MeCell to="/dashboard" icon={ShieldCheck} iconClass="bg-blue-500/10 text-blue-600" title="管理后台" />
        </div>
      )}

      {/* 服务 */}
      <div className="mt-3 px-1 text-[10.5px] text-muted-foreground">服务</div>
      <div className="mt-1 divide-y divide-muted overflow-hidden rounded-xl border">
        <MeCell
          to="/panel/notices"
          icon={Megaphone}
          iconClass="bg-amber-100 text-amber-600"
          title="公告"
          subtitle={latestNotice ? latestNotice.title : '暂无公告'}
        />
        <MeCell to="/panel/redemptions" icon={Gift} iconClass="bg-green-100 text-green-600" title="兑换码" />
        <MeCell to="/panel/releases" icon={BookOpen} iconClass="bg-indigo-100 text-indigo-600" title="更新日志" />
      </div>

      {/* 账户 */}
      <div className="mt-3 px-1 text-[10.5px] text-muted-foreground">账户</div>
      <div className="mt-1 divide-y divide-muted overflow-hidden rounded-xl border">
        <MeCell to="/panel/account" icon={UserCircle} iconClass="bg-slate-100 text-slate-600" title="账户资料" />
        <MeCell to="/panel/account" icon={Gauge} iconClass="bg-blue-100 text-blue-600" title="计费与扣费策略" />
      </div>

      {/* 登出 */}
      <button
        type="button"
        onClick={handleLogout}
        className="mt-3 flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-red-100 text-destructive">
          <LogOut className="h-[15px] w-[15px]" />
        </span>
        <span className="flex-1 text-[12.5px] font-semibold text-destructive">退出登录</span>
      </button>
    </div>
  );
}

export default PanelMe;
