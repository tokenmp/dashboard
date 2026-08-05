<?php
declare(strict_types=1);

namespace app\controller\panel;

use app\BaseController;
use app\service\DataScope;
use think\facade\Db;

/**
 * 用户面概览（panel，自取数据）
 *
 * 路由前缀 /api/v1/panel
 * - GET /overview  自身今日请求/token/成功率、各计费类型额度、近 30 天趋势
 *
 * 管理员在 panel 同样只看自己（DataScope::forSelf）。
 * 注：时间口径以数据库会话时区为准（current_date / now()）。
 */
class Overview extends BaseController
{
    /**
     * GET /api/v1/panel/overview
     */
    public function overview()
    {
        $ctx        = DataScope::forSelf(app('user'));
        $userId     = $ctx->userId();
        $todayStart = date('Y-m-d 00:00:00');

        $today = $this->todayStats($userId, $todayStart);
        $trend = $this->trend30($userId);
        $quota = $this->userQuota($userId);

        return success([
            'role' => 'user',
            'kpi'  => [
                'todayRequests'    => $today['total'],
                'todayTokens'      => $today['tokens'],
                'todaySuccessRate' => $today['rate'],
            ],
            'quota' => $quota,
            'trend' => $trend,
        ]);
    }

    /**
     * 今日请求统计：总数 / 成功数 / token 消耗 / 成功率
     */
    private function todayStats(string $userId, string $todayStart): array
    {
        $row = Db::connect('pgsql')->query(
            'select count(*) as total,'
            . " count(*) filter (where success is true) as success_count,"
            . ' coalesce(sum(total_tokens),0) as tokens'
            . ' from request_logs where created_at >= ? and user_id = ?',
            [$todayStart, $userId]
        )[0];
        $total        = (int) ($row['total'] ?? 0);
        $successCount = (int) ($row['success_count'] ?? 0);
        return [
            'total'         => $total,
            'success_count' => $successCount,
            'tokens'        => (int) ($row['tokens'] ?? 0),
            'rate'          => $total > 0 ? round($successCount / $total, 4) : null,
        ];
    }

    /**
     * 近 30 天每日趋势（请求/token/成功），用 generate_series 补齐缺失日
     */
    private function trend30(string $userId): array
    {
        $sql = 'with days as ('
             . " select generate_series((current_date - interval '29 day')::date, current_date::date, interval '1 day')::date as d"
             . ') select to_char(d.d, \'YYYY-MM-DD\') as day,'
             . ' count(r.id) as requests,'
             . ' coalesce(sum(r.total_tokens),0) as tokens,'
             . " count(*) filter (where r.success is true) as successes"
             . ' from days d left join request_logs r on r.created_at::date = d.d and r.user_id = ?'
             . ' group by d.d order by d.d';

        $rows = Db::connect('pgsql')->query($sql, [$userId]);
        return array_map(static function ($r) {
            return [
                'day'       => $r['day'],
                'requests'  => (int) ($r['requests'] ?? 0),
                'tokens'    => (int) ($r['tokens'] ?? 0),
                'successes' => (int) ($r['successes'] ?? 0),
            ];
        }, $rows);
    }

    /**
     * 自身各计费类型的额度：余额（usage_ledger 净和）/ 预扣（quota_reservations reserved）/ 可用
     *
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

        $map = []; // billing_plan => [...]
        foreach ($balances as $b) {
            $map[$b['billing_plan']] = [
                'token_balance'     => (int) $b['token_balance'],
                'request_balance'   => (int) $b['request_balance'],
                'reserved_tokens'   => 0,
                'reserved_requests' => 0,
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

        $order = ['coding', 'token', 'image'];
        $plans = array_unique(array_merge($order, array_keys($map)));
        $list  = [];
        foreach ($plans as $plan) {
            if (!isset($map[$plan])) {
                continue;
            }
            $row    = $map[$plan];
            $byReq  = $plan === 'coding';
            $balance = $byReq ? $row['request_balance'] : $row['token_balance'];
            $reserve = $byReq ? $row['reserved_requests'] : $row['reserved_tokens'];
            $list[]  = [
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
