import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { useRole } from '@/hooks/useRole';
import { homePathFor } from '@/utils/redirect';
import { Button } from '@/components/ui/button';

/**
 * 角色守卫：在 RequireAuth 的登录态校验之上，额外校验当前用户角色。
 * 角色不符时重定向到该角色的首页（admin→/dashboard，user→/panel）。
 *
 * - 未登录 → 跳 /login（带 redirect 回跳）。
 * - 已登录但用户信息尚未就绪 → 显示「加载中」，避免错误角色内容闪现。
 * - 角色匹配 → 渲染子路由。
 */
export function RequireRole({ role, children }: { role: 'admin' | 'user'; children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const { user, role: current, loadingUser, userError, clearUserError } = useRole();
  const location = useLocation();

  useEffect(() => {
    if (token && !user && !loadingUser && !userError) {
      fetchUser();
    }
  }, [token, user, loadingUser, userError, fetchUser]);

  if (!token) {
    const from = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${from}`} replace />;
  }

  if (!user) {
    if (userError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm">
          <p className="text-muted-foreground">{userError}，请稍后重试</p>
          <Button size="sm" onClick={() => { clearUserError(); fetchUser(true); }}>重试</Button>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  if (current !== role) {
    return <Navigate to={homePathFor(current)} replace />;
  }

  return <>{children}</>;
}

export default RequireRole;
