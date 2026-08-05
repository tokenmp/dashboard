<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\BotKey;
use app\model\User as UserModel;
use app\model\UserApiKey;
use app\model\UserPlan;
use app\service\DataScope;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 管理面：用户管理（dashboard，admin）
 *
 * 路由前缀 /api/v1/dashboard/users
 * - GET /        用户列表（分页+搜索 email/role/status）
 * - GET /:id     用户画像（基本信息 + API Key + Bot Key + 套餐 + 用量汇总）
 *
 * Admin 中间件已保证角色。
 * 脱敏：password_hash / token_version 永不返回；密钥类只给 key_prefix/key_suffix。
 */
class User extends BaseController
{
    /** GET /api/v1/dashboard/users */
    public function list()
    {
        [$page, $size] = Pagination::page($this->request);

        $query = UserModel::field(['id', 'email', 'role', 'status', 'preferred_billing', 'fallback_enabled', 'created_at', 'updated_at']);

        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->whereLike('email', "%{$keyword}%");
        }
        $role = trim((string) $this->request->get('role', ''));
        if ($role !== '') {
            $query->where('role', $role);
        }
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }

        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'updated_at'], '-created_at');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /** GET /api/v1/dashboard/users/:id */
    public function detail($id)
    {
        $user = UserModel::field(['id', 'email', 'role', 'status', 'preferred_billing', 'fallback_enabled', 'created_at', 'updated_at'])
            ->where('id', $id)
            ->find();
        if ($user === null) {
            throw new HttpException(404, '用户不存在');
        }

        // API Key（脱敏：去掉 key_hash）
        $apiKeys = UserApiKey::where('user_id', $id)
            ->field(['id', 'name', 'key_prefix', 'key_suffix', 'status', 'last_used_at', 'created_at'])
            ->order('created_at', 'desc')
            ->select();

        // Bot Key（脱敏：去掉 key_hash）
        $botKeys = BotKey::where('user_id', $id)
            ->field(['id', 'name', 'scope', 'key_prefix', 'key_suffix', 'status', 'last_used_at', 'created_at', 'updated_at'])
            ->order('created_at', 'desc')
            ->select();

        // 持有套餐（含 Plan 模板）
        $plans = UserPlan::where('user_id', $id)
            ->with(['plan'])
            ->order('created_at', 'desc')
            ->select();

        // 用量汇总：按 billing_plan 聚合 token_delta / request_delta
        $usage = Db::connect('pgsql')->query(
            'select coalesce(billing_plan, ?) as billing_plan,'
            . ' coalesce(sum(token_delta),0) as token_balance,'
            . ' coalesce(sum(request_delta),0) as request_balance'
            . ' from usage_ledger where user_id = ? group by billing_plan order by billing_plan',
            ['unknown', $id]
        );
        $usageSummary = array_map(static function ($r) {
            return [
                'billingPlan'    => $r['billing_plan'],
                'tokenBalance'   => (int) $r['token_balance'],
                'requestBalance' => (int) $r['request_balance'],
            ];
        }, $usage);

        return success([
            'user'    => $user,
            'apiKeys' => $apiKeys,
            'botKeys' => $botKeys,
            'plans'   => $plans,
            'usage'   => $usageSummary,
        ]);
    }
}
