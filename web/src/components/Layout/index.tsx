import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ScrollText, Users, UserCircle, Network, Gauge, Ticket, Gift, Store, Settings2, BookOpen, Bell, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/auth';
import { useRole } from '@/hooks/useRole';
import { StatusBadge } from '@/components/StatusBadge';
import { getMyNotificationsApi } from '@/api/system';
import type { NotificationItem } from '@/types/system';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/dashboard', label: '概览', icon: LayoutDashboard, adminOnly: false },
  { to: '/requests', label: '请求日志', icon: ScrollText, adminOnly: false },
  { to: '/users', label: '用户管理', icon: Users, adminOnly: true },
  { to: '/upstream', label: '上游与模型', icon: Network, adminOnly: false },
  { to: '/usage', label: '计费用量', icon: Gauge, adminOnly: false },
  { to: '/redeem/codes', label: '兑换码管理', icon: Ticket, adminOnly: true },
  { to: '/marketplace', label: '市场分账', icon: Store, adminOnly: false },
  { to: '/system', label: '系统', icon: Settings2, adminOnly: true },
  { to: '/releases', label: '更新日志', icon: BookOpen, adminOnly: false },
  { to: '/my/redemptions', label: '我的兑换', icon: Gift, adminOnly: false, userOnly: true },
  { to: '/account', label: '账户中心', icon: UserCircle, adminOnly: false },
];

/**
 * 主布局：左侧导航 + 顶部 Header（含通知铃铛与登出）+ 内容区 Outlet
 * 用于登录后受保护的路由。挂载时拉取当前用户信息写入 store，供全站角色化渲染使用。
 */
function Layout() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const { isAdmin } = useRole();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const items = NAV_ITEMS.filter((i) => (!i.adminOnly || isAdmin) && (!('userOnly' in i && i.userOnly) || !isAdmin));

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-card/50 md:flex">
        <div className="flex h-14 items-center border-b px-5">
          <span className="text-base font-semibold">TokenMP</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => (
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

/** 通知铃铛：下拉展示最近通知，带未读计数徽章 */
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getMyNotificationsApi({ size: 8, sort: '-created_at' });
      setList(res.list);
    } catch {
      // 忽略（如 401 由全局拦截器处理）
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const unread = list.filter((n) => !n.read_at).length;

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={() => { setOpen((o) => !o); if (!open) load(); }} aria-label="通知">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <Badge variant="destructive" className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px]">
            {unread > 99 ? '99+' : unread}
          </Badge>
        )}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-popover p-1 shadow-md">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-medium">通知</span>
              {loading && <span className="text-xs text-muted-foreground">加载中…</span>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {list.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">暂无通知</div>
              ) : list.map((n) => (
                <div key={n.id} className={cn('border-b px-3 py-2 last:border-0', !n.read_at && 'bg-accent/40')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium line-clamp-1">{n.title}</span>
                    {!n.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  </div>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={n.severity} />
                    <span className="text-[10px] text-muted-foreground">{n.created_at}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Layout;
