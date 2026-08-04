<?php
declare(strict_types=1);

namespace app\controller\api;

use app\BaseController;
use app\model\BotKey;
use app\model\Plan;
use app\model\User as UserModel;
use app\model\UserApiKey;
use app\model\UserPlan;
use app\service\DataScope;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 用户与账户
 *
 * 路由前缀：
 * - /api/users  （admin 全局用户管理）
 * - /api/user   （当前用户账户中心）
 *
 * 角色隔离：
 * - admin：/api/users 看全平台，可按 userId 筛选；/api/user 仍返回自己。
 * - user ：/api/users 不可用（403）；/api/user/* 仅看自己。
 *
 * 脱敏：password_hash / token_version 永不返回；密钥类不返回 key_hash，只给 key_prefix/key_suffix。
 */
class User extends BaseController
{
    /**
     * GET /api/users（admin）
     *
     * 分页+搜索（email/role/status）。
     */
    public function list()
    {
        $ctx = DataScope::forUser(app('user'));
        if (!$ctx->isAdmin()) {
            throw new HttpException(403, '无权访问');
        }

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

    /**
     * GET /api/users/:id（admin）
     *
     * 用户画像：基本信息 + API Key(脱敏) + Bot Key + 持有套餐(含 Plan) + 用量汇总。
     */
    public function detail($id)
    {
        $ctx = DataScope::forUser(app('user'));
        if (!$ctx->isAdmin()) {
            throw new HttpException(403, '无权访问');
        }

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
                'billingPlan'     => $r['billing_plan'],
                'tokenBalance'    => (int) $r['token_balance'],
                'requestBalance'  => (int) $r['request_balance'],
            ];
        }, $usage);

        return success([
            'user'     => $user,
            'apiKeys'  => $apiKeys,
            'botKeys'  => $botKeys,
            'plans'    => $plans,
            'usage'    => $usageSummary,
        ]);
    }

    /**
     * GET /api/user（user）
     *
     * 我的资料。
     */
    public function profile()
    {
        $ctx  = DataScope::forUser(app('user'));
        $user = UserModel::field(['id', 'email', 'role', 'status', 'preferred_billing', 'fallback_enabled', 'created_at', 'updated_at'])
            ->where('id', $ctx->userId())
            ->find();

        return success($user);
    }

    /**
     * GET /api/user/keys（user）
     *
     * 我的 user_api_keys（脱敏）。
     */
    public function keys()
    {
        $ctx = DataScope::forUser(app('user'));

        $list = UserApiKey::where('user_id', $ctx->userId())
            ->where('status', '<>', 'deleted')
            ->field(['id', 'name', 'key_prefix', 'key_suffix', 'status', 'last_used_at', 'created_at'])
            ->order('created_at', 'desc')
            ->select();

        return success($list);
    }

    /**
     * GET /api/user/keys/bot（user）
     *
     * 我的 bot_keys（脱敏）。
     */
    public function botKeys()
    {
        $ctx = DataScope::forUser(app('user'));

        $list = BotKey::where('user_id', $ctx->userId())
            ->where('status', '<>', 'deleted')
            ->field(['id', 'name', 'scope', 'key_prefix', 'key_suffix', 'status', 'last_used_at', 'created_at', 'updated_at'])
            ->order('created_at', 'desc')
            ->select();

        return success($list);
    }

    /**
     * GET /api/user/plans（user）
     *
     * 我的 user_plans（含 Plan 模板）。
     */
    public function plans()
    {
        $ctx = DataScope::forUser(app('user'));

        $list = UserPlan::where('user_id', $ctx->userId())
            ->with(['plan'])
            ->order('created_at', 'desc')
            ->select();

        return success($list);
    }
}
