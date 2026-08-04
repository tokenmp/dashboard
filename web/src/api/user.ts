import client from './client';
import type { ApiResponse } from '@/types';
import type { PageResult } from '@/types/common';
import { toParams } from '@/types/common';
import type {
  UserBasic,
  UserApiKeyItem,
  BotKeyItem,
  UserPlanItem,
  UserDetailResult,
  UserListQuery,
} from '@/types/user';

/** 用户列表（admin）：GET /users */
export async function getUsersApi(
  params: UserListQuery,
): Promise<PageResult<UserBasic>> {
  const res = await client.get<ApiResponse<PageResult<UserBasic>>>('/users', {
    params: toParams(params as Record<string, unknown>),
  });
  return res.data.data;
}

/** 用户详情（admin）：GET /users/:id */
export async function getUserDetailApi(id: string): Promise<UserDetailResult> {
  const res = await client.get<ApiResponse<UserDetailResult>>(`/users/${id}`);
  return res.data.data;
}

/** 我的资料：GET /user */
export async function getMyProfileApi(): Promise<UserBasic> {
  const res = await client.get<ApiResponse<UserBasic>>('/user');
  return res.data.data;
}

/** 我的 API Key：GET /user/keys */
export async function getMyKeysApi(): Promise<UserApiKeyItem[]> {
  const res = await client.get<ApiResponse<UserApiKeyItem[]>>('/user/keys');
  return res.data.data;
}

/** 我的 Bot Key：GET /user/keys/bot */
export async function getMyBotKeysApi(): Promise<BotKeyItem[]> {
  const res = await client.get<ApiResponse<BotKeyItem[]>>('/user/keys/bot');
  return res.data.data;
}

/** 我的套餐：GET /user/plans */
export async function getMyPlansApi(): Promise<UserPlanItem[]> {
  const res = await client.get<ApiResponse<UserPlanItem[]>>('/user/plans');
  return res.data.data;
}
