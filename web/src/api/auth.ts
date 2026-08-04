import client from './client';
import { rsaOaepEncrypt } from '@/utils/crypto';
import type { ApiResponse, LoginResult, PublicKeyResult, UserInfo } from '@/types';

/**
 * 取一次性公钥：GET /auth/public-key（公开，按 IP 限流）
 */
export async function getPublicKeyApi(): Promise<PublicKeyResult> {
  const res = await client.get<ApiResponse<PublicKeyResult>>('/auth/public-key');
  return res.data.data;
}

/**
 * 用一次性公钥加密密码类明文（可复用：登录 / 改密 / 重置 等）。
 * 密钥单用，每次现取，不做跨调用缓存。
 */
export async function encryptSecret(
  plaintext: string,
): Promise<{ keyId: string; ciphertext: string }> {
  const { keyId, publicKey } = await getPublicKeyApi();
  const ciphertext = await rsaOaepEncrypt(publicKey, plaintext);
  return { keyId, ciphertext };
}

/**
 * 登录：加密密码后提交。
 * 若后端返回“加密凭证已失效”（HTTP 410 / code:2，如密钥被用或过期），
 * 自动重新取 key 重试一次。
 */
export async function loginApi(
  username: string,
  password: string,
): Promise<LoginResult> {
  const submit = async () => {
    const { keyId, ciphertext } = await encryptSecret(password);
    return client.post<ApiResponse<LoginResult>>('/auth/login', {
      username,
      password: ciphertext,
      keyId,
    });
  };

  try {
    return (await submit()).data.data;
  } catch (e) {
    // 加密凭证失效 → 重取 key 重试一次；其它错误（如 401 密码错）继续抛出
    const err = e as { response?: { status?: number; data?: { code?: number } } };
    if (err?.response?.status === 410 && err?.response?.data?.code === 2) {
      return (await submit()).data.data;
    }
    throw e;
  }
}

/**
 * 当前登录用户：GET /auth/user（需 Bearer token）
 */
export async function getUserApi(): Promise<UserInfo> {
  const res = await client.get<ApiResponse<UserInfo>>('/auth/user');
  return res.data.data;
}
