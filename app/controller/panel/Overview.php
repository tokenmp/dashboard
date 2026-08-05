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
     * 用户各计费类型的额度（套餐感知）：
     * - coding（编程套餐）：展示「本周」与「近 5 小时」已用请求数与套餐限额。
     *   本周窗口从当前计费周起始（周一 00:00 UTC = 中国时间周一 8:00）算起，
     *   若套餐在本周内才开通，则从套餐开通时间算起；不再用累计 ledger 余额
     *   （coding 套餐无固定余额概念，累计扣费求和恒为负、无意义）。
     * - token / image：若套餐设有 token_limit（固定额度）→ 展示「已用 / 限额」；
     *   否则（计量预付费）→ 展示 ledger 余额 / 预扣 / 可用。
     */
    private function userQuota(string $userId): array
    {
        // 1. 用户有效套餐（按 plan_type 聚合，取最宽松限额 + 最早开通时间）
        $planRows = Db::connect('pgsql')->query(
            'select p.plan_type,'
            . ' max(p.name) as name,'
            . ' max(coalesce(p.hourly_5h_limit, 0)) as h5_limit,'
            . ' max(coalesce(p.weekly_limit, 0)) as weekly_limit,'
            . ' max(coalesce(p.token_limit, 0)) as token_limit,'
            . ' min(up.activated_at)::text as activated_at'
            . ' from user_plans up join plans p on p.id = up.plan_id'
            . " where up.user_id = ? and up.status = 'active'"
            . ' and (up.expires_at is null or up.expires_at > now())'
            . ' group by p.plan_type',
            [$userId]
        );
        $planMap = []; // plan_type => [name, h5_limit, weekly_limit, token_limit, activated_at]
        foreach ($planRows as $p) {
            $planMap[$p['plan_type']] = $p;
        }

        // 2. ledger 余额与累计已用（token/image 计量型用）
        $balances = Db::connect('pgsql')->query(
            "select coalesce(billing_plan, 'unknown') as billing_plan,"
            . ' coalesce(sum(token_delta), 0) as token_balance,'
            . ' coalesce(sum(case when token_delta < 0 then abs(token_delta) else 0 end), 0) as token_used'
            . ' from usage_ledger where user_id = ? group by billing_plan',
            [$userId]
        );
        $balMap = [];
        foreach ($balances as $b) {
            $balMap[$b['billing_plan']] = $b;
        }

        // 3. 预扣（计量型可用 = 余额 − 预扣）
        $reserved = Db::connect('pgsql')->query(
            "select coalesce(billing_plan, 'unknown') as billing_plan,"
            . ' coalesce(sum(reserved_tokens), 0) as reserved_tokens'
            . " from quota_reservations where user_id = ? and status = 'reserved' group by billing_plan",
            [$userId]
        );
        $resMap = [];
        foreach ($reserved as $r) {
            $resMap[$r['billing_plan']] = (int) $r['reserved_tokens'];
        }

        // 4. coding 用量：近 5 小时（滚动）/ 本周（周一 00:00 UTC 起，套开开通前不计入）
        $winUsage = ['h5' => 0, 'week' => 0];
        if (isset($planMap['coding']) || isset($balMap['coding'])) {
            // 当前计费周起始：周一 00:00 UTC（中国时间周一 8:00）
            $nowUtc   = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
            $monday   = $nowUtc->setISODate((int) $nowUtc->format('o'), (int) $nowUtc->format('W'), 1)->setTime(0, 0, 0);
            $mondayStr = $monday->format('Y-m-d H:i:s');
            // 套餐开通时间（最早）；无套餐则用 epoch（不限制下限）
            $actStr = !empty($planMap['coding']['activated_at'])
                ? (string) $planMap['coding']['activated_at']
                : '1970-01-01 00:00:00';

            $w = Db::connect('pgsql')->query(
                'select'
                . " count(*) filter (where created_at >= greatest(now() - interval '5 hours', ?::timestamptz)) as h5,"
                . ' count(*) filter (where created_at >= greatest(?::timestamptz, ?::timestamptz)) as wk'
                . ' from request_logs where user_id = ? and success is true',
                [$actStr, $mondayStr, $actStr, $userId]
            )[0];
            $winUsage['h5']   = (int) ($w['h5'] ?? 0);
            $winUsage['week'] = (int) ($w['wk'] ?? 0);
        }

        // 5. 组装：合并套餐与 ledger 出现的所有计费类型
        $order = ['coding', 'token', 'image'];
        $types = array_unique(array_merge($order, array_keys($planMap), array_keys($balMap)));
        $list  = [];
        foreach ($types as $type) {
            if (!isset($planMap[$type]) && !isset($balMap[$type])) {
                continue;
            }
            $plan = $planMap[$type] ?? null;
            if ($type === 'coding') {
                $h5Limit = $plan ? (int) $plan['h5_limit'] : 0;
                $wkLimit = $plan ? (int) $plan['weekly_limit'] : 0;
                $list[]  = [
                    'billingPlan' => $type,
                    'planName'    => $plan['name'] ?? null,
                    'unit'        => 'requests',
                    'mode'        => 'window',
                    // 总额度：coding 以本周额度为总额度
                    'total'       => $wkLimit > 0 ? $wkLimit : null,
                    'windows'     => [
                        ['key' => 'week', 'label' => '本周', 'limit' => $wkLimit > 0 ? $wkLimit : null, 'used' => $winUsage['week']],
                        ['key' => 'h5', 'label' => '近 5 小时', 'limit' => $h5Limit > 0 ? $h5Limit : null, 'used' => $winUsage['h5']],
                    ],
                ];
            } else {
                // token / image
                $b          = $balMap[$type] ?? ['token_balance' => 0, 'token_used' => 0];
                $tokenLimit = $plan ? (int) $plan['token_limit'] : 0;
                $used       = (int) $b['token_used'];
                if ($tokenLimit > 0) {
                    // 固定额度套餐：已用 / 限额
                    $list[] = [
                        'billingPlan' => $type,
                        'planName'    => $plan['name'] ?? null,
                        'unit'        => 'tokens',
                        'mode'        => 'capped',
                        'total'       => $tokenLimit,
                        'limit'       => $tokenLimit,
                        'used'        => $used,
                        'available'   => max(0, $tokenLimit - $used),
                    ];
                } else {
                    // 计量预付费：ledger 余额 / 预扣 / 可用
                    $balance = (int) $b['token_balance'];
                    $res     = $resMap[$type] ?? 0;
                    $list[]  = [
                        'billingPlan' => $type,
                        'planName'    => $plan['name'] ?? null,
                        'unit'        => 'tokens',
                        'mode'        => 'balance',
                        'balance'     => $balance,
                        'used'        => $used,
                        'reserved'    => $res,
                        'available'   => $balance - $res,
                    ];
                }
            }
        }
        return $list;
    }
}
