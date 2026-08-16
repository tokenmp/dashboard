import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ScrollText, Users, Gauge, Ticket, Store, Settings2, BookOpen, ExternalLink, LogOut, Package, ChevronDown, UserCircle, Building2, Waypoints, Brain, KeyRound, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/store/auth';
import { useRole } from '@/hooks/useRole';
import { NotificationBell } from '@/components/NotificationBell';
import { ScrollingAnnouncement } from '@/components/ScrollingAnnouncement';
import { BrandLogo } from '@/components/BrandLogo';
import { MobileTabBar } from '@/components/mobile';
import type { MobileTabItem, MobileNavGroup } from '@/components/mobile';
import { getDashboardNoticesApi } from '@/api/dashboard';
import { cn } from '@/lib/utils';

const NAV_GROUPS: { label: string; items: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }[] }[] = [
  {
    label: '概览',
    items: [{ to: '/dashboard', label: '概览', icon: LayoutDashboard }],
  },
  {
    label: '上游配置',
    items: [
      { to: '/dashboard/upstream/providers', label: '供应商', icon: Building2 },
      { to: '/dashboard/upstream/keys', label: '上游账号', icon: KeyRound },
      { to: '/dashboard/upstream/routes', label: '路由组', icon: Waypoints },
      { to: '/dashboard/upstream/models', label: '平台模型', icon: Brain },
    ],
  },
  {
    label: '计费',
    items: [
      { to: '/dashboard/price-rules', label: '请求倍率', icon: Percent },
    ],
  },
  {
    label: '数据监控',
    items: [
      { to: '/dashboard/requests', label: '请求日志', icon: ScrollText },
      { to: '/dashboard/usage', label: '计费用量', icon: Gauge },
    ],
  },
  {
    label: '业务管理',
    items: [
      { to: '/dashboard/users', label: '用户管理', icon: Users },
      { to: '/dashboard/plans', label: '套餐管理', icon: Package },
      { to: '/dashboard/redeem/codes', label: '兑换码管理', icon: Ticket },
      { to: '/dashboard/marketplace', label: '市场分账', icon: Store },
    ],
  },
  {
    label: '平台运维',
    items: [
      { to: '/dashboard/system', label: '系统', icon: Settings2 },
      { to: '/dashboard/releases', label: '更新日志', icon: BookOpen },
    ],
  },
  {
    label: '用户面板',
    items: [{ to: '/panel', label: '用户面板', icon: ExternalLink }],
  },
];

/** 移动端底部 Tab 直达入口（管理端页面内容适配在 Stage 2，导航先就位） */
const ADMIN_TABS: MobileTabItem[] = [
  { to: '/dashboard', label: '概览', icon: LayoutDashboard, end: true },
  { to: '/dashboard/requests', label: '请求', icon: ScrollText },
  { to: '/dashboard/users', label: '用户', icon: Users },
  { to: '/dashboard/upstream/providers', label: '上游', icon: Building2 },
];

const ADMIN_MORE_GROUPS: MobileNavGroup[] = [
  {
    label: '上游配置',
    items: [
      { to: '/dashboard/upstream/keys', label: '上游账号', icon: KeyRound },
      { to: '/dashboard/upstream/routes', label: '路由组', icon: Waypoints },
      { to: '/dashboard/upstream/models', label: '平台模型', icon: Brain },
    ],
  },
  { label: '计费', items: [{ to: '/dashboard/price-rules', label: '请求倍率', icon: Percent }] },
  { label: '数据监控', items: [{ to: '/dashboard/usage', label: '计费用量', icon: Gauge }] },
  {
    label: '业务管理',
    items: [
      { to: '/dashboard/plans', label: '套餐管理', icon: Package },
      { to: '/dashboard/redeem/codes', label: '兑换码管理', icon: Ticket },
      { to: '/dashboard/marketplace', label: '市场分账', icon: Store },
    ],
  },
  {
    label: '平台运维',
    items: [
      { to: '/dashboard/system', label: '系统', icon: Settings2 },
      { to: '/dashboard/releases', label: '更新日志', icon: BookOpen },
    ],
  },
  { label: '快捷入口', items: [{ to: '/panel', label: '用户面板', icon: ExternalLink }] },
];

/**
 * 管理端布局（/dashboard）：左侧导航 + 顶部 Header（通知铃铛与登出）+ 内容区 Outlet。
 * 仅 admin 角色可达（由外层 RequireRole 守卫），故导航项不再按角色过滤。
 */
function Layout() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const { user } = useRole();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-card/50 md:flex">
        <div className="flex h-14 items-center border-b px-5">
          <span className="text-base font-semibold">TokenMP 管理端</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? 'pt-3' : ''}>
              <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{group.label}</div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/dashboard'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-6">
          {/* 移动端：logo + 品牌名（点击回首页），用户菜单收进「更多」Sheet */}
          <Link to="/" className="flex items-center gap-2 md:hidden">
            <BrandLogo className="h-[22px] w-[22px]" />
            <span className="text-[15px] font-bold">管理端</span>
          </Link>
          <ScrollingAnnouncement
            fetcher={getDashboardNoticesApi}
            viewAllTo="/dashboard/system"
            itemTo={() => '/dashboard/system'}
            className="hidden md:flex"
          />
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="hidden md:inline-flex">
                  <UserCircle className="mr-1.5 h-4 w-4" />
                  <span className="max-w-[180px] truncate">{user?.email ?? '—'}</span>
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user?.email ?? '未登录'}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/panel">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    用户面板
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  登出
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
        <MobileTabBar
          tabs={ADMIN_TABS}
          moreGroups={ADMIN_MORE_GROUPS}
          moreFooter={
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-accent"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          }
        />
      </div>
    </div>
  );
}

export default Layout;
