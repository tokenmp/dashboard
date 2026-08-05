<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\Announcement;
use app\model\SchemaMigration;
use app\model\UserReleaseRead;
use app\model\VersionRelease;
use app\service\DataScope;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 管理面：公告 / 版本日志 / 系统配置 / 迁移台账（dashboard，admin）
 *
 * 路由前缀 /api/v1/dashboard
 * - GET /notices         公告（全部，可按 status 过滤）
 * - GET /releases        版本日志（全部，可按 status 过滤）
 * - GET /releases/:id    版本详情（任意，附当前用户是否已读）
 * - GET /config          系统配置（敏感值脱敏）
 * - GET /migrations      迁移台账
 *
 * Admin 中间件已保证角色。脱敏：system_config 敏感 key 的 value 脱敏为 "******"。
 */
class System extends BaseController
{
    /** 敏感配置 key（write-only，列表只返回 masked 元数据） */
    private const SENSITIVE_KEYS = ['captcha_access_key_secret', 'smtp_password'];

    /** GET /api/v1/dashboard/notices */
    public function notices()
    {
        [$page, $size] = Pagination::page($this->request);

        $query = Announcement::where('status', '<>', 'archived');
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }
        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->whereLike('title', "%{$keyword}%");
        }
        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'publish_from', 'sort_order'], '-created_at');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /** POST /api/v1/dashboard/notices —— 创建公告 */
    public function createNotice()
    {
        $row        = $this->noticeInput();
        $row['id']  = Db::connect('pgsql')->query('select gen_random_uuid() as id')[0]['id'];
        $row['created_by'] = app('user')->id;
        $notice     = Announcement::create($row);
        $notice->id = $row['id'];
        return success($notice);
    }

    /** PUT /api/v1/dashboard/notices/:id —— 更新公告 */
    public function updateNotice($id)
    {
        $notice = Announcement::where('id', $id)->find();
        if ($notice === null) {
            throw new HttpException(404, '公告不存在');
        }
        $notice->save($this->noticeInput());
        return success($notice->refresh());
    }

    /** DELETE /api/v1/dashboard/notices/:id —— 软删（归档） */
    public function deleteNotice($id)
    {
        $notice = Announcement::where('id', $id)->find();
        if ($notice === null) {
            throw new HttpException(404, '公告不存在');
        }
        $notice->status = 'archived';
        $notice->save();
        return success(['id' => $id]);
    }

    /** 读取并校验公告字段（create/update 共用，前端表单传全集） */
    private function noticeInput(): array
    {
        $title = trim((string) $this->request->post('title', ''));
        if ($title === '') {
            throw new HttpException(400, '公告标题不能为空');
        }
        $severity = $this->request->post('severity');
        $status   = $this->request->post('status');
        return [
            'title'         => $title,
            'body'          => (string) $this->request->post('body', ''),
            'severity'      => in_array($severity, ['info', 'warning', 'urgent'], true) ? $severity : 'info',
            'scope'         => (string) ($this->request->post('scope') ?? 'all'),
            'dismissible'   => (bool) $this->request->post('dismissible', true),
            'status'        => in_array($status, ['draft', 'published', 'archived'], true) ? $status : 'draft',
            'sort_order'    => (int) $this->request->post('sort_order', 0),
            'publish_from'  => ($f = $this->request->post('publish_from')) ? $f : date('Y-m-d H:i:s'),
            'publish_until' => ($u = $this->request->post('publish_until')) ? $u : null,
        ];
    }

    /** GET /api/v1/dashboard/releases */
    public function releases()
    {
        [$page, $size] = Pagination::page($this->request);

        $query = VersionRelease::where('status', '<>', 'archived');
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }
        Pagination::applyTimeRange($query, $this->request, 'released_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['released_at', 'sort_order'], '-sort_order');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /** GET /api/v1/dashboard/releases/:id（任意，附当前用户是否已读） */
    public function releaseDetail($id)
    {
        $ctx     = DataScope::forUser(app('user'));
        $release = VersionRelease::where('id', $id)->find();
        if ($release === null) {
            throw new HttpException(404, '版本不存在');
        }

        $read = UserReleaseRead::where('user_id', $ctx->userId())
            ->where('release_id', $id)
            ->find();

        return success([
            'release' => $release,
            'readAt'  => $read?->read_at,
        ]);
    }

    /** POST /api/v1/dashboard/releases —— 创建版本日志 */
    public function createRelease()
    {
        $row          = $this->releaseInput();
        $row['id']    = Db::connect('pgsql')->query('select gen_random_uuid() as id')[0]['id'];
        $row['created_by'] = app('user')->id;
        $release      = VersionRelease::create($row);
        $release->id  = $row['id'];
        return success($release);
    }

    /** PUT /api/v1/dashboard/releases/:id —— 更新版本日志 */
    public function updateRelease($id)
    {
        $release = VersionRelease::where('id', $id)->find();
        if ($release === null) {
            throw new HttpException(404, '版本不存在');
        }
        // version 唯一键，更新时不改 version（避免冲突）
        $input = $this->releaseInput();
        unset($input['version']);
        $release->save($input);
        return success($release->refresh());
    }

    /** DELETE /api/v1/dashboard/releases/:id —— 软删（归档） */
    public function deleteRelease($id)
    {
        $release = VersionRelease::where('id', $id)->find();
        if ($release === null) {
            throw new HttpException(404, '版本不存在');
        }
        $release->status = 'archived';
        $release->save();
        return success(['id' => $id]);
    }

    /** 读取并校验版本日志字段（create/update 共用） */
    private function releaseInput(): array
    {
        $version = trim((string) $this->request->post('version', ''));
        $title   = trim((string) $this->request->post('title', ''));
        if ($title === '') {
            throw new HttpException(400, '版本标题不能为空');
        }
        $status       = $this->request->post('status');
        $releaseType  = $this->request->post('release_type');
        $releasedAt   = $this->request->post('released_at');
        return [
            'version'      => $version !== '' ? $version : 'v0.0.0',
            'title'        => $title,
            'summary'      => (string) $this->request->post('summary', ''),
            'body'         => (string) $this->request->post('body', ''),
            'release_type' => in_array($releaseType, ['feature', 'fix', 'improvement', 'perf'], true) ? $releaseType : 'feature',
            'released_at'  => ($releasedAt ? $releasedAt : date('Y-m-d H:i:s')),
            'status'       => in_array($status, ['draft', 'published', 'archived'], true) ? $status : 'draft',
            'sort_order'   => (int) $this->request->post('sort_order', 0),
        ];
    }

    /** GET /api/v1/dashboard/config（敏感 key 的 value 脱敏为 "******"） */
    public function config()
    {
        // 用原生查询取 jsonb value（模型 json 类型转换器对标量值会报 foreach 错）
        $rows = Db::connect('pgsql')->query('select key, value, updated_at from system_config order by key asc');
        $data = [];
        foreach ($rows as $r) {
            $sensitive = in_array($r['key'], self::SENSITIVE_KEYS, true);
            $data[] = [
                'key'        => $r['key'],
                'value'      => $sensitive ? '******' : $r['value'],
                'sensitive'  => $sensitive,
                'updated_at' => $r['updated_at'],
            ];
        }

        return success($data);
    }

    /** GET /api/v1/dashboard/migrations */
    public function migrations()
    {
        [$page, $size] = Pagination::page($this->request);
        $query = SchemaMigration::where('filename', '<>', null);
        $total = $query->count();
        $list = SchemaMigration::order('applied_at', 'desc')->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }
}
