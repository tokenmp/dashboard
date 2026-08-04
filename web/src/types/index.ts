/**
 * 后端统一响应结构（信封：code / message / data）
 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
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
 * 一次性加密公钥
 */
export interface PublicKeyResult {
  keyId: string;
  alg: string;
  publicKey: string;
  expiresIn: number;
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
