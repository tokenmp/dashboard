import { useAuthStore } from '@/store/auth';

/**
 * 派生当前登录用户的角色信息，驱动页面按角色渲染。
 *
 * - isAdmin：看全平台数据（可按 userId 筛选）
 * - 普通用户：仅看自己
 */
export function useRole() {
  const user = useAuthStore((s) => s.user);
  const loadingUser = useAuthStore((s) => s.loadingUser);
  const role = user?.role;
  const isAdmin = role === 'admin';
  return { user, role, isAdmin, loadingUser };
}
