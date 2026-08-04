<?php
namespace app\controller\api;

use app\BaseController;
use app\model\User;
use app\service\Jwt;

/**
 * 认证接口
 *
 * 路由前缀 /api/auth
 */
class Auth extends BaseController
{
    /**
     * 登录失败时用的占位哈希：账号不存在时仍走一次 password_verify，
     * 使“账号不存在”与“密码错误”的响应耗时一致，避免基于响应耗时枚举管理账号。
     */
    private const DUMMY_HASH = '$2y$12$smIQMZE9z1vIYqjQazXs3u2ckaEmzx8gkv8fcikJCVwSdOxCJgTee';

    /**
     * 登录：校验管理员账号密码并签发 JWT
     * POST /api/auth/login
     *
     * 仅 role=admin 且 status=active 的用户可登录管理后台。
     * - 登录标识为邮箱（前端字段名沿用 username）；
     * - 密码哈希为 bcrypt（$2a$/$2b$），password_verify 直接兼容；
     * - JWT 内携带 token_version（v）：改密码/状态/角色时自增，使旧 token 立即失效（见 Auth 中间件）。
     */
    public function login()
    {
        $account  = (string) $this->request->post('username', '');
        $password = (string) $this->request->post('password', '');

        if ($account === '' || $password === '') {
            return fail('账号和密码不能为空', 1, 422);
        }

        // 仅管理员可登录；按邮箱查找
        $user = User::where('email', $account)->where('role', 'admin')->find();

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
     * 获取当前登录用户信息
     * GET /api/auth/user（需经过 Auth 中间件）
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
