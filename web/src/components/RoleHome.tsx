import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { useRole } from '@/hooks/useRole';
import { homePathFor } from '@/utils/redirect';

/**
 * 根路径 /：按当前登录角色重定向到对应首页。
 * - 未登录 → /login。
 * - admin → /dashboard，其余 → /panel。
 *
 * 用户信息未就绪时先拉取并显示加载态，避免跳错区。
 */
function RoleHome() {
  const token = useAuthStore((s) => s.token);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const { user, loadingUser } = useRole();

  useEffect(() => {
    if (token && !user && !loadingUser) {
      fetchUser();
    }
  }, [token, user, loadingUser, fetchUser]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  return <Navigate to={homePathFor(user.role)} replace />;
}

export default RoleHome;
