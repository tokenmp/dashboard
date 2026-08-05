<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\Notification;
use app\support\Pagination;

/**
 * 管理面：指定用户的通知（dashboard，admin）
 *
 * 路由前缀 /api/v1/dashboard/users
 * - GET /:id/notifications  指定用户的通知（支持 ?unread=1）
 *
 * Admin 中间件已保证角色。
 */
class Notification extends BaseController
{
    /** GET /api/v1/dashboard/users/:id/notifications */
    public function forUser($id)
    {
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
}
