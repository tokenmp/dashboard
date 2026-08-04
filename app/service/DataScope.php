<?php
declare(strict_types=1);

namespace app\service;

use app\model\User;
use think\db\BaseQuery;

/**
 * 角色数据隔离上下文
 *
 * 统一封装「当前登录用户能看到哪些数据」的逻辑，供所有业务控制器复用：
 * - admin：可看全平台数据；当请求显式带 userId 参数时，按该用户筛选（管理员查指定用户）。
 * - user：强制只能看自己的数据，忽略前端传入的任何 userId（防越权）。
 *
 * 用法：
 *   $ctx = DataScope::forUser(app('user'));      // 由 Auth 中间件注入
 *   $ctx->isAdmin();
 *   $query = $ctx->scope(RequestLog::where('...'), 'user_id', $this->request->get('userId'));
 *
 * 注意：领域级软删（status='deleted'）不在此处理，由各查询自行过滤；
 *      本类只负责「按用户隔离」这一横向关切。
 */
class DataScope
{
    private User $user;

    private function __construct(User $user)
    {
        $this->user = $user;
    }

    public static function forUser(User $user): self
    {
        return new self($user);
    }

    /** 当前登录用户模型 */
    public function user(): User
    {
        return $this->user;
    }

    /** 当前登录用户 ID */
    public function userId(): string
    {
        return (string) $this->user->id;
    }

    /** 是否为管理员（看全平台） */
    public function isAdmin(): bool
    {
        return $this->user->role === 'admin';
    }

    /**
     * 给查询附加用户隔离条件
     *
     * @param BaseQuery  $query          ThinkPHP 查询对象（Model::xxx() 返回的 BaseQuery）
     * @param string     $userIdColumn   用户外键列名，默认 user_id
     * @param string|null $filterUserId  仅 admin 生效：当传入时按该用户筛选；user 角色忽略此值
     * @return BaseQuery 原查询（链式调用）
     */
    public function scope($query, string $userIdColumn = 'user_id', ?string $filterUserId = null)
    {
        if (!$this->isAdmin()) {
            // 普通用户：强制绑定自身，忽略任何前端传入的 userId
            return $query->where($userIdColumn, $this->user->id);
        }

        // 管理员：可选按指定用户筛选
        if ($filterUserId !== null && $filterUserId !== '') {
            return $query->where($userIdColumn, $filterUserId);
        }

        return $query;
    }
}
