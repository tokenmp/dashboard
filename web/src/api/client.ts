import axios from 'axios';

/**
 * token 在 localStorage 中的 key（与 auth store 共享）
 */
export const TOKEN_KEY = 'token';

/**
 * axios 实例
 *
 * - baseURL 来自 VITE_API_BASE_URL，默认 /api
 * - 请求拦截：从 localStorage 读 token，注入 Authorization: Bearer
 * - 响应拦截：401 时清 token 并跳转登录页（整页刷新，store 自然重置）
 *
 * 说明：拦截器直接读写 localStorage 而非 import auth store，避免循环依赖；
 *      store 与 localStorage 通过共享 TOKEN_KEY 保持同步。
 */
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
});

// 请求拦截：注入 Bearer token
client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：401 清 token 并跳登录
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default client;
