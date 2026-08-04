import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';

/**
 * 路由守卫：未登录（无 token）时重定向到 /login，并把当前地址
 * 通过 ?redirect= 带上，便于登录后返回。
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();

  if (!token) {
    const from = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${from}`} replace />;
  }

  return <>{children}</>;
}

export default RequireAuth;
