import { create } from 'zustand';
import { loginApi, getUserApi } from '@/api/auth';
import { TOKEN_KEY } from '@/api/client';
import type { UserInfo } from '@/types';

interface AuthState {
  token: string | null;
  /** 当前登录用户（登录后/受保护页挂载时拉取） */
  user: UserInfo | null;
  /** 加载用户中（避免重复拉取） */
  loadingUser: boolean;
  /** 登录：调用后端拿 token，写入 localStorage 与 state */
  login: (username: string, password: string) => Promise<void>;
  /** 登出：清空 token 与用户 */
  logout: () => void;
  /** 拉取当前用户信息并写入 state；已存在或加载中时跳过 */
  fetchUser: (force?: boolean) => Promise<UserInfo | null>;
}

// 启动时从 localStorage 恢复登录态
const initialToken = localStorage.getItem(TOKEN_KEY);

export const useAuthStore = create<AuthState>((set, get) => ({
  token: initialToken,
  user: null,
  loadingUser: false,
  login: async (username, password) => {
    const { token } = await loginApi(username, password);
    localStorage.setItem(TOKEN_KEY, token);
    set({ token, user: null });
    // 登录成功后立即拉取用户信息
    get().fetchUser(true);
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, user: null });
  },
  fetchUser: async (force = false) => {
    const { token, user, loadingUser } = get();
    if (!token) return null;
    if (user && !force) return user;
    if (loadingUser) return user;

    set({ loadingUser: true });
    try {
      const u = await getUserApi();
      set({ user: u });
      return u;
    } finally {
      set({ loadingUser: false });
    }
  },
}));
