<?php
declare(strict_types=1);

namespace app\controller\auth;

use app\BaseController;
use app\model\User;
use app\service\Jwt;
use app\service\SecretCrypto;

/**
 * 认证接口（中性，panel / dashboard 共用）
 *
 * 路由前缀 /api/v1/auth
 */
class Auth extends BaseController
{
    /**
     * 登录失败时用的占位哈希：账号不存在时仍走一次 password_verify，
     * 使“账号不存在”与“密码错误”的响应耗时一致，避免基于响应耗时枚举账号。
     */
    private const DUMMY_HASH = '$2y$12$smIQMZE9z1vIYqjQazXs3u2ckaEmzx8gkv8fcikJCVwSdOxCJgTee';

    /**
     * 登录：校验账号密码并签发 JWT
     * POST /api/v1/auth/login
     *
     * 密码为前端用一次性公钥 RSA-OAEP 加密后的 base64 密文，需带 keyId；
     * 解密失败(密钥已用/过期/无效)返回 code:2(HTTP 410)，前端重取 key 重试。
     *
     * 仅 role ∈ {admin, user} 且 status=active 的用户可登录。
     * - 登录标识为邮箱（前端字段名沿用 username）；
     * - 密码哈希为 bcrypt（$2a$/$2b$），password_verify 直接兼容；
     * - JWT 内携带 token_version（v）：改密码/状态/角色时自增，使旧 token 立即失效（见 Auth 中间件）。
     */
    public function login()
    {
        $account     = (string) $this->request->post('username', '');
        $encPassword = (string) $this->request->post('password', ''); // RSA-OAEP 密文(base64)
        $keyId       = (string) $this->request->post('keyId', '');

        if ($account === '' || $encPassword === '' || $keyId === '') {
            return fail('账号和密码不能为空', 1, 422);
        }

        // 一次性私钥解密；失败(密钥已用/过期/无效)→ 专用错误，前端重取 key 重试。
        // 此步骤发生在密码校验之前，不泄露密码对错。
        $password = SecretCrypto::decrypt($encPassword, $keyId);
        if ($password === null) {
            return fail('加密凭证已失效，请重试', 2, 410);
        }

        // admin 与 user 均可登录；按邮箱查找
        $user = User::where('email', $account)->whereIn('role', ['admin', 'user'])->find();

        // 无论账号是否存在都走一次 bcrypt 校验，使响应耗时一致（防账号枚举）
        $hash = ($user?->password_hash) ?? self::DUMMY_HASH;
        if ($user === null || !password_verify($password, $hash)) {
            return fail('账号或密码错误', 1, 401);
        }
        if ($user->status !== 'active') {
            return fail('账号已被禁用', 1, 403);
        }

        $token = Jwt::issue([
            'sub'   => $user->id,
            'email' => $user->email,
            'role'  => $user->role,
            'v'     => $user->token_version, // 令牌版本：自增即吊销所有旧 token
        ]);

        return success([
            'token'    => $token,
            'username' => $user->email, // 前端展示用
        ], '登录成功');
    }

    /**
     * 签发一次性公钥（前端用 RSA-OAEP 加密密码类字段）
     * GET /api/v1/auth/public-key（公开，按 IP 限流防 RSA keygen DoS）
     */
    public function publicKey()
    {
        if (!SecretCrypto::acquireKeySlot((string) $this->request->ip())) {
            return fail('请求过于频繁，请稍后再试', 1, 429);
        }

        [$keyId, $publicKey, $expiresIn] = SecretCrypto::issueKey();

        return success([
            'keyId'     => $keyId,
            'alg'       => 'RSA-OAEP',
            'publicKey' => $publicKey, // SPKI DER base64
            'expiresIn' => $expiresIn,
        ]);
    }

    /**
     * 获取当前登录用户信息
     * GET /api/v1/auth/user（需经过 Auth 中间件）
     */
    public function user()
    {
        $user = app('user'); // 由 Auth 中间件加载并注入

        return success([
            'id'       => $user->id,
            'username' => $user->email,
            'email'    => $user->email,
            'role'     => $user->role,
        ]);
    }
}
