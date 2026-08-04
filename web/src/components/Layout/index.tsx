import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ScrollText, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/dashboard', label: '概览', icon: LayoutDashboard },
  { to: '/requests', label: '请求日志', icon: ScrollText },
];

/**
 * 主布局：左侧导航 + 顶部 Header（含登出）+ 内容区 Outlet
 * 用于登录后受保护的路由。挂载时拉取当前用户信息写入 store，供全站角色化渲染使用。
 */
function Layout() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* 侧边导航 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-card/50 md:flex">
        <div className="flex h-14 items-center border-b px-5">
          <span className="text-base font-semibold">TokenMP</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <span className="text-lg font-semibold md:hidden">TokenMP Dashboard</span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1.5 h-4 w-4" />
            登出
          </Button>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
