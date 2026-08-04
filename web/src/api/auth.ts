import client from './client';
import type { ApiResponse, LoginResult, UserInfo } from '@/types';

/**
 * 登录：POST /auth/login
 */
export async function loginApi(
  username: string,
  password: string,
): Promise<LoginResult> {
  const res = await client.post<ApiResponse<LoginResult>>('/auth/login', {
    username,
    password,
  });
  return res.data.data;
}

/**
 * 当前登录用户：GET /auth/user（需 Bearer token）
 */
export async function getUserApi(): Promise<UserInfo> {
  const res = await client.get<ApiResponse<UserInfo>>('/auth/user');
  return res.data.data;
}
