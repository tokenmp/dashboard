<?php
namespace app\middleware;

use app\model\User;
use app\service\Jwt;
use Closure;
use think\exception\HttpException;
use think\facade\Env;
use think\Request;

/**
 * JWT 鉴权中间件
 *
 * 从 Authorization 头解析 Bearer token，校验通过后把 payload 挂到容器，
 * 控制器内通过 app('auth') 即可获取当前登录用户信息。
 */
class Auth
{
    public function handle(Request $request, Closure $next)
    {
        $token = $this->parseToken($request);

        if ($token === null) {
            throw new HttpException(401, '未登录或缺少 token');
        }

        try {
            $payload = Jwt::verify($token);
        } catch (\Throwable $e) {
            throw new HttpException(401, '登录已过期或 token 无效');
        }

        // 加载用户并校验状态与 token_version：
        // 用户被禁用，或改密码/状态/角色使 token_version 自增后，旧 token 立即失效。
        $user = User::find((string) ($payload->sub ?? ''));
        if (!$user
            || $user->status !== 'active'
            || (int) $user->token_version !== (int) ($payload->v ?? -1)) {
            throw new HttpException(401, '登录已失效，请重新登录');
        }

        // 挂到容器：app('auth') 取 JWT payload，app('user') 取用户模型
        app()->instance('auth', $payload);
        app()->instance('user', $user);

        return $next($request);
    }

    /**
     * 从请求头解析 token
     */
    protected function parseToken(Request $request): ?string
    {
        $header = $request->header('Authorization', '');
        $prefix = (string) Env::get('JWT_PREFIX', 'Bearer');

        if ($header !== '' && str_starts_with($header, $prefix . ' ')) {
            return trim(substr($header, strlen($prefix) + 1));
        }

        return null;
    }
}
