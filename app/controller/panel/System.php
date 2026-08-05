<?php
declare(strict_types=1);

namespace app\controller\panel;

use app\BaseController;
use app\model\Announcement;
use app\model\UserReleaseRead;
use app\model\VersionRelease;
use app\service\DataScope;
use app\support\Pagination;
use think\exception\HttpException;

/**
 * 用户面：公告与版本日志（panel，仅 published）
 *
 * 路由前缀 /api/v1/panel
 * - GET /notices        已发布公告（在 publish_from/until 区间内）
 * - GET /releases       已发布版本日志
 * - GET /releases/:id   版本详情（附当前用户是否已读）
 */
class System extends BaseController
{
    /** GET /api/v1/panel/notices */
    public function notices()
    {
        $ctx = DataScope::forSelf(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $now = date('Y-m-d H:i:s');
        $query = Announcement::where('status', 'published')
            ->where('publish_from', '<=', $now)
            ->where(function ($q) use ($now) {
                $q->whereNull('publish_until')->whereOr('publish_until', '>=', $now);
            });

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

    /** GET /api/v1/panel/releases */
    public function releases()
    {
        $ctx = DataScope::forSelf(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = VersionRelease::where('status', 'published');
        Pagination::applyTimeRange($query, $this->request, 'released_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['released_at', 'sort_order'], '-sort_order');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /** GET /api/v1/panel/releases/:id（附当前用户是否已读） */
    public function releaseDetail($id)
    {
        $ctx     = DataScope::forSelf(app('user'));
        $release = VersionRelease::where('id', $id)
            ->where('status', 'published')
            ->find();
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
}
