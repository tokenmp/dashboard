import axios from 'axios';

/**
 * axios 实例
 *
 * baseURL 来自环境变量 VITE_API_BASE_URL（开发/生产均为 /api）
 * 完整的请求/响应拦截器、token 注入、401 处理将在 feat/auth-integration 分支补齐
 */
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
});

export default client;
