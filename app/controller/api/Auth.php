<?php
namespace app\controller\api;

use app\BaseController;
use app\service\Jwt;

/**
 * 认证接口
 *
 * 路由前缀 /api/auth
 */
class Auth extends BaseController
{
    /**
     * 登录，校验账号密码并签发 JWT
     * POST /api/auth/login
     *
     * 说明：本分支仅做基础设施，此处用 demo 账号 admin/admin；
     *      真实用户表/密码哈希在 feat/auth-integration 分支接入。
     */
    public function login()
    {
        $username = $this->request->post('username', '');
        $password = $this->request->post('password', '');

        if ($username === '' || $password === '') {
            return fail('账号和密码不能为空', 1, 422);
        }

        // TODO(feat/auth-integration): 接入用户表与密码哈希校验
        if ($username !== 'admin' || $password !== 'admin') {
            return fail('账号或密码错误', 1, 401);
        }

        $token = Jwt::issue([
            'sub'      => 1,
            'username' => 'admin',
        ]);

        return success([
            'token'    => $token,
            'username' => 'admin',
        ], '登录成功');
    }

    /**
     * 获取当前登录用户信息
     * GET /api/auth/user（需经过 Auth 中间件）
     */
    public function user()
    {
        $auth = app('auth');

        return success([
            'id'       => $auth->sub ?? null,
            'username' => $auth->username ?? null,
        ]);
    }
}
