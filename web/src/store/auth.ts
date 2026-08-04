import { create } from 'zustand';
import { loginApi } from '@/api/auth';
import { TOKEN_KEY } from '@/api/client';

interface AuthState {
  token: string | null;
  /** 登录：调用后端拿 token，写入 localStorage 与 state */
  login: (username: string, password: string) => Promise<void>;
  /** 登出：清空 token */
  logout: () => void;
}

// 启动时从 localStorage 恢复登录态
const initialToken = localStorage.getItem(TOKEN_KEY);

export const useAuthStore = create<AuthState>((set) => ({
  token: initialToken,
  login: async (username, password) => {
    const { token } = await loginApi(username, password);
    localStorage.setItem(TOKEN_KEY, token);
    set({ token });
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null });
  },
}));
