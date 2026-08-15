<?php
declare(strict_types=1);

namespace app\controller\auth;

use app\BaseController;
use app\model\User;
use app\service\Captcha;
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

    /** 注册/重置密码的最小密码长度 */
    private const MIN_PASSWORD_LEN = 8;

    /**
     * 验证码公开配置：GET /api/v1/auth/captcha-config
     * 供前端初始化阿里云滑块 SDK（prefix/region/场景 ID）；不含 AK/SK。
     * 场景 ID 为空 = 该场景未启用人机验证。
     */
    public function captchaConfig()
    {
        return success(Captcha::publicConfig());
    }

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
        // 人机验证守卫：login scene 未配置时直接放行（当前库中为空 = 登录不弹滑块）
        $guard = Captcha::guard('login', $this->request->post('captcha_verify_param'));
        if ($guard !== null) {
            return $guard;
        }

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
     * 注册：创建普通用户并直接签发 JWT（注册即登录）
     * POST /api/v1/auth/register（公开）
     *
     * body: { username(邮箱), password(RSA-OAEP 密文), keyId }
     * 与登录共用一次性公钥加密通道；密码规则与重置密码一致（≥8 位）。
     * 邮箱全局唯一（含已禁用/软删账号，避免借注册复活旧账号）。
     */
    public function register()
    {
        // 人机验证守卫：register scene 已配置时须先过阿里云滑块
        $guard = Captcha::guard('register', $this->request->post('captcha_verify_param'));
        if ($guard !== null) {
            return $guard;
        }

        $email       = strtolower(trim((string) $this->request->post('username', '')));
        $encPassword = (string) $this->request->post('password', ''); // RSA-OAEP 密文(base64)
        $keyId       = (string) $this->request->post('keyId', '');

        if ($email === '' || $encPassword === '' || $keyId === '') {
            return fail('邮箱和密码不能为空', 1, 422);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return fail('邮箱格式不正确', 1, 422);
        }

        // 一次性私钥解密密码（与登录一致；失败→专用错误，前端重取 key 重试）
        $password = SecretCrypto::decrypt($encPassword, $keyId);
        if ($password === null) {
            return fail('加密凭证已失效，请重试', 2, 410);
        }
        if (strlen($password) < self::MIN_PASSWORD_LEN) {
            return fail('密码至少 ' . self::MIN_PASSWORD_LEN . ' 位', 1, 422);
        }

        // 邮箱唯一：任何状态（含 disabled / soft-deleted）都不允许重注册
        if (User::where('email', $email)->find() !== null) {
            return fail('该邮箱已注册', 1, 409);
        }

        // id 需显式生成（users.id 虽有 gen_random_uuid 默认值，但 think-orm 插入后
        // 不会回填 DB 生成的默认值，JWT sub 会拿到 null），用 UUID v4
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        $userId = vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
        User::create([
            'id'           => $userId,
            'email'        => $email,
            'password_hash' => password_hash($password, PASSWORD_BCRYPT),
            'role'         => 'user',
            'status'       => 'active',
        ]);

        // 回读：token_version 等 DB 默认值同样不回填，JWT 里的 v 必须取真实值
        $user = User::where('email', $email)->find();

        $token = Jwt::issue([
            'sub'   => $user->id,
            'email' => $user->email,
            'role'  => $user->role,
            'v'     => $user->token_version,
        ]);

        return success([
            'token'    => $token,
            'username' => $user->email,
        ], '注册成功');
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
