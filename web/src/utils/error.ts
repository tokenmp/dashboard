import type { AxiosError } from 'axios';
import type { ApiResponse } from '@/types';

/**
 * 从 axios 错误中提取后端返回的提示信息（message），
 * 兜底到原生 message 或默认文案。
 */
export function getApiError(err: unknown): string {
  const e = err as AxiosError<ApiResponse>;
  return e.response?.data?.message || e.message || '请求失败，请稍后重试';
}
