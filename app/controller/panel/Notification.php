<?php
declare(strict_types=1);

namespace app\controller\panel;

use app\BaseController;
use app\model\Notification as NotificationModel;
use app\service\DataScope;
use app\support\Pagination;
use think\exception\HttpException;

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

        $query = NotificationModel::where('user_id', $ctx->userId());

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

    /** POST /api/v1/panel/user/notifications/:id/read —— 标记单条已读 */
    public function markRead($id)
    {
        $userId = app('user')->id;
        $n = NotificationModel::where('id', $id)->where('user_id', $userId)->find();
        if ($n === null) {
            throw new HttpException(404, '通知不存在');
        }
        if ($n->read_at === null) {
            $n->read_at = date('Y-m-d H:i:s');
            $n->save();
        }
        return success(['id' => $id, 'read_at' => $n->read_at]);
    }

    /** POST /api/v1/panel/user/notifications/read-all —— 标记全部已读 */
    public function markAllRead()
    {
        $userId = app('user')->id;
        $now = date('Y-m-d H:i:s');
        $count = NotificationModel::where('user_id', $userId)
            ->whereNull('read_at')
            ->update(['read_at' => $now]);
        return success(['updated' => $count]);
    }
}
