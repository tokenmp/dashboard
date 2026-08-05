import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ScrollText, Gauge, KeyRound, Gift, Megaphone, BookOpen, UserCircle, ShieldCheck, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth';
import { useRole } from '@/hooks/useRole';
import { NotificationBell } from '@/components/NotificationBell';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/panel', label: '概览', icon: LayoutDashboard, end: true },
  { to: '/panel/requests', label: '我的请求', icon: ScrollText, end: false },
  { to: '/panel/usage', label: '我的用量', icon: Gauge, end: false },
  { to: '/panel/keys', label: '我的密钥', icon: KeyRound, end: false },
  { to: '/panel/redemptions', label: '我的兑换', icon: Gift, end: false },
  { to: '/panel/notices', label: '公告', icon: Megaphone, end: false },
  { to: '/panel/releases', label: '更新日志', icon: BookOpen, end: false },
  { to: '/panel/account', label: '账户', icon: UserCircle, end: false },
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
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-card/50 md:flex">
        <div className="flex h-14 items-center border-b px-5">
          <span className="text-base font-semibold">TokenMP 面板</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => (
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

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <span className="text-lg font-semibold md:hidden">TokenMP 面板</span>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-1.5 h-4 w-4" />
              登出
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default PanelLayout;
