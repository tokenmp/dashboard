import { create } from 'zustand';
import { loginApi, getUserApi, registerApi } from '@/api/auth';
import { TOKEN_KEY } from '@/api/client';
import type { UserInfo } from '@/types';

interface AuthState {
  token: string | null;
  /** 当前登录用户（登录后/受保护页挂载时拉取） */
  user: UserInfo | null;
  /** 加载用户中（避免重复拉取） */
  loadingUser: boolean;
  /** 拉取用户失败的原因；非空时停止自动重试，需手动重试 */
  userError: string | null;
  /** 登录：调用后端拿 token，写入 localStorage 与 state */
  login: (username: string, password: string, captchaVerifyParam?: string) => Promise<void>;
  /** 注册：成功即登录（后端直接签发 token），写入 localStorage 与 state */
  register: (email: string, password: string, captchaVerifyParam?: string) => Promise<void>;
  /** 登出：清空 token 与用户 */
  logout: () => void;
  /** 拉取当前用户信息并写入 state；已存在或加载中或已失败时跳过 */
  fetchUser: (force?: boolean) => Promise<UserInfo | null>;
  /** 清除用户拉取错误，允许再次自动重试 */
  clearUserError: () => void;
}

// 启动时从 localStorage 恢复登录态
const initialToken = localStorage.getItem(TOKEN_KEY);

export const useAuthStore = create<AuthState>((set, get) => ({
  token: initialToken,
  user: null,
  loadingUser: false,
  userError: null,
  login: async (username, password, captchaVerifyParam) => {
    const { token } = await loginApi(username, password, captchaVerifyParam);
    localStorage.setItem(TOKEN_KEY, token);
    set({ token, user: null });
    // 登录成功后立即拉取用户信息
    get().fetchUser(true);
  },
  register: async (email, password, captchaVerifyParam) => {
    const { token } = await registerApi(email, password, captchaVerifyParam);
    localStorage.setItem(TOKEN_KEY, token);
    set({ token, user: null });
    get().fetchUser(true);
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, user: null });
  },
  fetchUser: async (force = false) => {
    const { token, user, loadingUser, userError } = get();
    if (!token) return null;
    if (user && !force) return user;
    if (loadingUser) return user;
    // 失败后不再自动重试，避免后端异常时前端无限刷请求
    if (userError && !force) return null;

    set({ loadingUser: true, userError: null });
    try {
      const u = await getUserApi();
      set({ user: u });
      return u;
    } catch (e) {
      // 401 已由 client 响应拦截器跳登录页处理，这里只兜底其余错误
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status !== 401) {
        set({ userError: status ? `服务异常（${status}）` : '网络连接失败' });
      }
      return null;
    } finally {
      set({ loadingUser: false });
    }
  },
  clearUserError: () => set({ userError: null }),
}));
