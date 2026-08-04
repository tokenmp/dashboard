<?php
declare(strict_types=1);

namespace app\controller\api;

use app\BaseController;
use app\model\UpstreamKey;
use app\model\User;
use app\service\DataScope;
use think\facade\Db;

/**
 * 概览仪表盘
 *
 * 路由前缀 /api/dashboard
 *
 * 按角色返回不同指标：
 * - admin：全平台用户、上游 Key、今日请求/token/成功率、近 30 天趋势
 * - user ：自身各计费类型额度（余额/预扣/可用）、今日请求/token/成功率、近 30 天趋势
 *
 * 注：时间口径以数据库会话时区为准（current_date / now()）；KPI 与趋势共用同一基准日。
 */
class Dashboard extends BaseController
{
    /**
     * GET /api/dashboard/overview
     */
    public function overview()
    {
        $ctx        = DataScope::forUser(app('user'));
        $todayStart = date('Y-m-d 00:00:00');

        $data = $ctx->isAdmin()
            ? $this->adminOverview($todayStart)
            : $this->userOverview($ctx->userId(), $todayStart);

        return success($data);
    }

    /**
     * 管理员概览：全平台指标
     */
    private function adminOverview(string $todayStart): array
    {
        $totalUsers   = User::count();
        $activeUsers  = User::where('status', 'active')->count();
        $active7dFrom = date('Y-m-d 00:00:00', strtotime('-6 days'));
        $activeUsers7d = (int) (Db::connect('pgsql')->query(
            'select count(distinct user_id) as cnt from request_logs where created_at >= ?',
            [$active7dFrom]
        )[0]['cnt'] ?? 0);

        $activeUpstreamKeys = UpstreamKey::where('status', 'active')->count();

        $today = $this->todayStats(null, $todayStart);
        $trend = $this->trend30(null);

        return [
            'role' => 'admin',
            'kpi'  => [
                'totalUsers'         => $totalUsers,
                'activeUsers'        => $activeUsers,
                'activeUsers7d'      => $activeUsers7d,
                'activeUpstreamKeys' => $activeUpstreamKeys,
                'todayRequests'      => $today['total'],
                'todayTokens'        => $today['tokens'],
                'todaySuccessRate'   => $today['rate'],
            ],
            'trend' => $trend,
        ];
    }

    /**
     * 普通用户概览：自身额度与请求指标
     */
    private function userOverview(string $userId, string $todayStart): array
    {
        $today = $this->todayStats($userId, $todayStart);
        $trend = $this->trend30($userId);
        $quota = $this->userQuota($userId);

        return [
            'role' => 'user',
            'kpi'  => [
                'todayRequests'    => $today['total'],
                'todayTokens'      => $today['tokens'],
                'todaySuccessRate' => $today['rate'],
            ],
            'quota' => $quota,
            'trend' => $trend,
        ];
    }

    /**
     * 今日请求统计：总数 / 成功数 / token 消耗 / 成功率
     *
     * @param string|null $userId null 表示全平台（admin）
     */
    private function todayStats(?string $userId, string $todayStart): array
    {
        $sql   = 'select count(*) as total,'
               . " count(*) filter (where success is true) as success_count,"
               . ' coalesce(sum(total_tokens),0) as tokens'
               . ' from request_logs where created_at >= ?';
        $binds = [$todayStart];
        if ($userId !== null) {
            $sql   .= ' and user_id = ?';
            $binds[] = $userId;
        }
        $row          = Db::connect('pgsql')->query($sql, $binds)[0];
        $total        = (int) ($row['total'] ?? 0);
        $successCount = (int) ($row['success_count'] ?? 0);
        return [
            'total'        => $total,
            'success_count' => $successCount,
            'tokens'       => (int) ($row['tokens'] ?? 0),
            'rate'         => $total > 0 ? round($successCount / $total, 4) : null,
        ];
    }

    /**
     * 近 30 天每日趋势（请求/token/成功），用 generate_series 补齐缺失日
     *
     * @param string|null $userId null 表示全平台（admin）；非空时作为 LEFT JOIN 条件限定
     */
    private function trend30(?string $userId): array
    {
        $sql = 'with days as ('
             . " select generate_series((current_date - interval '29 day')::date, current_date::date, interval '1 day')::date as d"
             . ') select to_char(d.d, \'YYYY-MM-DD\') as day,'
             . ' count(r.id) as requests,'
             . ' coalesce(sum(r.total_tokens),0) as tokens,'
             . " count(*) filter (where r.success is true) as successes"
             . ' from days d left join request_logs r on r.created_at::date = d.d';
        $binds = [];
        if ($userId !== null) {
            $sql   .= ' and r.user_id = ?';
            $binds[] = $userId;
        }
        $sql .= ' group by d.d order by d.d';

        $rows = Db::connect('pgsql')->query($sql, $binds);
        return array_map(static function ($r) {
            return [
                'day'      => $r['day'],
                'requests' => (int) ($r['requests'] ?? 0),
                'tokens'   => (int) ($r['tokens'] ?? 0),
                'successes'=> (int) ($r['successes'] ?? 0),
            ];
        }, $rows);
    }

    /**
     * 用户各计费类型的额度：余额（usage_ledger 净和）/ 预扣（quota_reservations reserved）/ 可用
     *
     * 计费单位按 billing_plan 区分：
     * - coding：按请求次数计（request_delta / reserved_requests）
     * - token / image / 其它：按 token 计（token_delta / reserved_tokens）
     */
    private function userQuota(string $userId): array
    {
        $balances = Db::connect('pgsql')->query(
            "select coalesce(billing_plan, 'unknown') as billing_plan,"
            . ' coalesce(sum(token_delta),0) as token_balance,'
            . ' coalesce(sum(request_delta),0) as request_balance'
            . ' from usage_ledger where user_id = ? group by billing_plan',
            [$userId]
        );
        $reserved = Db::connect('pgsql')->query(
            "select coalesce(billing_plan, 'unknown') as billing_plan,"
            . ' coalesce(sum(reserved_tokens),0) as reserved_tokens,'
            . ' coalesce(sum(reserved_requests),0) as reserved_requests'
            . " from quota_reservations where user_id = ? and status = 'reserved' group by billing_plan",
            [$userId]
        );

        $map = []; // billing_plan => [token_balance, request_balance, reserved_tokens, reserved_requests]
        foreach ($balances as $b) {
            $map[$b['billing_plan']] = [
                'token_balance'    => (int) $b['token_balance'],
                'request_balance'  => (int) $b['request_balance'],
                'reserved_tokens'  => 0,
                'reserved_requests'=> 0,
            ];
        }
        foreach ($reserved as $r) {
            $plan = $r['billing_plan'];
            if (!isset($map[$plan])) {
                $map[$plan] = ['token_balance' => 0, 'request_balance' => 0, 'reserved_tokens' => 0, 'reserved_requests' => 0];
            }
            $map[$plan]['reserved_tokens']   = (int) $r['reserved_tokens'];
            $map[$plan]['reserved_requests'] = (int) $r['reserved_requests'];
        }

        // 固定展示顺序：coding / token / image，其余追加
        $order = ['coding', 'token', 'image'];
        $plans = array_unique(array_merge($order, array_keys($map)));
        $list  = [];
        foreach ($plans as $plan) {
            if (!isset($map[$plan])) {
                continue;
            }
            $row   = $map[$plan];
            $byReq = $plan === 'coding';
            $balance  = $byReq ? $row['request_balance'] : $row['token_balance'];
            $reserve  = $byReq ? $row['reserved_requests'] : $row['reserved_tokens'];
            $list[]   = [
                'billingPlan' => $plan,
                'unit'        => $byReq ? 'requests' : 'tokens',
                'balance'     => $balance,
                'reserved'    => $reserve,
                'available'   => $balance - $reserve,
            ];
        }
        return $list;
    }
}
