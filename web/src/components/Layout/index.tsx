import { Outlet, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth';

/**
 * 主布局：顶部 Header（含登出）+ 内容区 Outlet
 * 用于登录后受保护的路由。
 */
function Layout() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <span className="text-lg font-semibold">TokenMP Dashboard</span>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          登出
        </Button>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
