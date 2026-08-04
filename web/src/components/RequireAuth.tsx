import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';

/**
 * 路由守卫：未登录（无 token）时重定向到 /login
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default RequireAuth;
