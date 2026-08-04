/**
 * 后端统一响应结构
 */
export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

/**
 * 登录返回
 */
export interface LoginResult {
  token: string;
  username: string;
}

/**
 * 当前登录用户
 */
export interface UserInfo {
  id: string;
  username: string;
  email: string;
  role: string;
}
