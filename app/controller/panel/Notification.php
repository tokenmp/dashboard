<?php
declare(strict_types=1);

namespace app\controller\panel;

use app\BaseController;
use app\model\Notification;
use app\service\DataScope;
use app\support\Pagination;

/**
 * 用户面：我的通知（panel，自取）
 *
 * 路由前缀 /api/v1/panel/user
 * - GET /notifications  我的通知（支持 ?unread=1 / ?type=）
 */
class Notification extends BaseController
{
    /** GET /api/v1/panel/user/notifications */
    public function mine()
    {
        $ctx = DataScope::forSelf(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = Notification::where('user_id', $ctx->userId());

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
}
