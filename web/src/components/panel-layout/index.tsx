import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ScrollText, Gauge, KeyRound, Gift, Cpu, Megaphone, BookOpen, UserCircle, ShieldCheck, LogOut, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/store/auth';
import { useRole } from '@/hooks/useRole';
import { NotificationBell } from '@/components/NotificationBell';
import { ScrollingAnnouncement } from '@/components/ScrollingAnnouncement';
import { BrandLogo } from '@/components/BrandLogo';
import { MobileTabBar } from '@/components/mobile';
import type { MobileTabItem } from '@/components/mobile';
import { getPanelNoticesApi } from '@/api/panel';
import { cn } from '@/lib/utils';

const NAV_GROUPS: { label: string; items: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }[] }[] = [
  { label: '概览', items: [{ to: '/panel', label: '概览', icon: LayoutDashboard, end: true }] },
  { label: '模型与密钥', items: [
    { to: '/panel/models', label: '模型目录', icon: Cpu, end: false },
    { to: '/panel/keys', label: '我的密钥', icon: KeyRound, end: false },
  ]},
  { label: '请求与账单', items: [
    { to: '/panel/requests', label: '请求日志', icon: ScrollText, end: false },
    { to: '/panel/usage', label: '计费账单', icon: Gauge, end: false },
  ]},
  { label: '公告与更新', items: [
    { to: '/panel/notices', label: '公告', icon: Megaphone, end: false },
    { to: '/panel/releases', label: '更新日志', icon: BookOpen, end: false },
  ]},
  { label: '账户', items: [
    { to: '/panel/redemptions', label: '兑换码', icon: Gift, end: false },
    { to: '/panel/account', label: '账户', icon: UserCircle, end: false },
  ]},
];

/** 移动端底部五 Tab：概览 / 模型 / 密钥 / 日志 / 我的（其余入口收进「我的」页） */
const PANEL_TABS: MobileTabItem[] = [
  { to: '/panel', label: '概览', icon: LayoutDashboard, end: true },
  { to: '/panel/models', label: '模型', icon: Cpu },
  { to: '/panel/keys', label: '密钥', icon: KeyRound },
  { to: '/panel/requests', label: '日志', icon: ScrollText },
  { to: '/panel/me', label: '我的', icon: UserCircle },
];

/**
 * 用户端布局（/panel）：精简侧栏 + 顶部 Header（通知铃铛与登出）+ 内容区 Outlet。
 * 与管理端 Layout 共用通知/登出，仅导航项不同。
 */
function PanelLayout() {
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
          <span className="text-base font-semibold">TokenMP 面板</span>
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
                    end={item.end}
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
          {user?.role === 'admin' && (
            <NavLink
              to="/dashboard"
              className="mt-2 flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ShieldCheck className="h-4 w-4" />
              管理后台
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-6">
          {/* 移动端：logo + 品牌名（点击回首页），用户菜单收进「我的」页 */}
          <Link to="/" className="flex items-center gap-2 md:hidden">
            <BrandLogo className="h-[22px] w-[22px]" />
            <span className="text-[15px] font-bold">TokenMP</span>
          </Link>
          <ScrollingAnnouncement
            fetcher={getPanelNoticesApi}
            viewAllTo="/panel/notices"
            itemTo={() => '/panel/notices'}
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
                {user?.role === 'admin' && (
                  <DropdownMenuItem asChild>
                    <a href="/dashboard">
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      管理后台
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <NavLink to="/panel/account">
                    <UserCircle className="mr-2 h-4 w-4" />
                    账户
                  </NavLink>
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
        <MobileTabBar tabs={PANEL_TABS} />
      </div>
    </div>
  );
}

export default PanelLayout;
