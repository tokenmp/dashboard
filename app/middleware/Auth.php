<?php
namespace app\middleware;

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

        // 挂到容器，控制器用 app('auth')->sub 取用户 id 等
        app()->instance('auth', $payload);

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
