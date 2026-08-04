<?php
declare(strict_types=1);

namespace app\controller\api;

use app\BaseController;
use app\model\Announcement;
use app\model\Notification;
use app\model\SchemaMigration;
use app\model\UserReleaseRead;
use app\model\VersionRelease;
use app\service\DataScope;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 系统与通知
 *
 * 路由前缀 /api/system、/api/user、/api/users
 *
 * - GET /api/system/notices              公告（admin 全部含 draft；user 仅 published 且在 publish_from/until 内）
 * - GET /api/user/notifications          我的通知（支持 ?unread=1）
 * - GET /api/users/:id/notifications     指定用户通知（admin）
 * - GET /api/system/releases            版本列表（admin 全部；user 仅 published）
 * - GET /api/system/releases/:id        版本详情（附当前用户是否已读）
 * - GET /api/system/config              系统配置（admin，敏感值脱敏）
 * - GET /api/system/migrations          迁移台账（admin）
 *
 * 脱敏：system_config 敏感 key（captcha_access_key_secret、smtp_password）的 value 脱敏。
 */
class System extends BaseController
{
    /** 敏感配置 key（write-only，列表只返回 masked 元数据） */
    private const SENSITIVE_KEYS = ['captcha_access_key_secret', 'smtp_password'];

    /**
     * GET /api/system/notices
     */
    public function notices()
    {
        $ctx = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = Announcement::where('status', '<>', 'archived');

        if (!$ctx->isAdmin()) {
            // user：仅 published 且在 publish_from/until 区间内
            $query->where('status', 'published')
                ->where('publish_from', '<=', date('Y-m-d H:i:s'))
                ->where(function ($q) {
                    $q->whereNull('publish_until')->whereOr('publish_until', '>=', date('Y-m-d H:i:s'));
                });
        } else {
            $status = trim((string) $this->request->get('status', ''));
            if ($status !== '') {
                $query->where('status', $status);
            }
        }

        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->whereLike('title', "%{$keyword}%");
        }
        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'sort_order'], '-sort_order');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /**
     * GET /api/user/notifications（我的通知）
     */
    public function myNotifications()
    {
        $ctx = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = Notification::where('user_id', $ctx->userId());

        // ?unread=1 只看未读
        if ($this->request->get('unread') === '1') {
            $query->whereNull('read_at');
        }
        $type = trim((string) $this->request->get('type', ''));
        if ($type !== '') {
            $query->where('type', $type);
        }
        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at'], '-created_at');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /**
     * GET /api/users/:id/notifications（admin）
     */
    public function userNotifications($id)
    {
        $ctx = DataScope::forUser(app('user'));
        if (!$ctx->isAdmin()) {
            throw new HttpException(403, '无权访问');
        }

        [$page, $size] = Pagination::page($this->request);
        $query = Notification::where('user_id', $id);
        if ($this->request->get('unread') === '1') {
            $query->whereNull('read_at');
        }
        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at'], '-created_at');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /**
     * GET /api/system/releases
     */
    public function releases()
    {
        $ctx = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = VersionRelease::where('status', '<>', 'archived');
        if (!$ctx->isAdmin()) {
            $query->where('status', 'published');
        } else {
            $status = trim((string) $this->request->get('status', ''));
            if ($status !== '') {
                $query->where('status', $status);
            }
        }
        Pagination::applyTimeRange($query, $this->request, 'released_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['released_at', 'sort_order'], '-sort_order');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /**
     * GET /api/system/releases/:id（附当前用户是否已读）
     */
    public function releaseDetail($id)
    {
        $ctx = DataScope::forUser(app('user'));

        $query = VersionRelease::where('id', $id);
        if (!$ctx->isAdmin()) {
            $query->where('status', 'published');
        }
        $release = $query->find();
        if ($release === null) {
            throw new HttpException(404, '版本不存在');
        }

        $read = UserReleaseRead::where('user_id', $ctx->userId())
            ->where('release_id', $id)
            ->find();

        return success([
            'release' => $release,
            'readAt' => $read?->read_at,
        ]);
    }

    /**
     * GET /api/system/config（admin）
     *
     * 敏感 key 的 value 脱敏为 "******"。
     */
    public function config()
    {
        $ctx = DataScope::forUser(app('user'));
        if (!$ctx->isAdmin()) {
            throw new HttpException(403, '无权访问');
        }

        // 用原生查询取 jsonb value（模型 json 类型转换器对标量值会报 foreach 错）
        $rows = Db::connect('pgsql')->query('select key, value, updated_at from system_config order by key asc');
        $data = [];
        foreach ($rows as $r) {
            $sensitive = in_array($r['key'], self::SENSITIVE_KEYS, true);
            $data[] = [
                'key' => $r['key'],
                'value' => $sensitive ? '******' : $r['value'],
                'sensitive' => $sensitive,
                'updated_at' => $r['updated_at'],
            ];
        }

        return success($data);
    }

    /**
     * GET /api/system/migrations（admin）
     */
    public function migrations()
    {
        $ctx = DataScope::forUser(app('user'));
        if (!$ctx->isAdmin()) {
            throw new HttpException(403, '无权访问');
        }

        [$page, $size] = Pagination::page($this->request);
        $query = SchemaMigration::where('filename', '<>', null);
        $total = $query->count();
        $list = SchemaMigration::order('applied_at', 'desc')->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }
}
