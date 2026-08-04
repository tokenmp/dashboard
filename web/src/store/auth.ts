import { create } from 'zustand';

/**
 * 认证状态（占位实现）
 *
 * 真正的 token 存取、登录/登出动作、持久化将在 feat/auth-integration 分支补齐。
 */
interface AuthState {
  token: string | null;
  setToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  setToken: (token) => set({ token }),
}));
