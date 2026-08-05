<?php
namespace app\middleware;

use Closure;
use think\exception\HttpException;
use think\Request;

/**
 * 管理员鉴权中间件
 *
 * 需挂在 Auth 之后：Auth 已校验 JWT 并把当前用户挂到容器（app('user')），
 * 本中间件只负责校验其角色是否为 admin，非 admin 直接 403。
 *
 * 用于纯管理类接口（用户管理、上游供应商/路由组/模型、系统配置/迁移、
 * 兑换码管理、计费规则等），与各控制器内已有的 DataScope 校验互为双保险。
 *
 * 注：登录、概览、我的请求/用量/密钥/兑换、公告、更新日志等「双角色共用」
 *     接口不挂本中间件，由控制器内 DataScope 按角色 scope/过滤。
 */
class Admin
{
    public function handle(Request $request, Closure $next)
    {
        $user = app('user');

        // 正常情况下 Auth 必先于本中间件执行；防御性兜底
        if (!$user || $user->role !== 'admin') {
            throw new HttpException(403, '无权访问');
        }

        return $next($request);
    }
}
