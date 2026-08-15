<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\RequestLog as RequestLogModel;
use think\facade\Db;

/**
 * 管理面概览（dashboard，全平台）
 *
 * 路由前缀 /api/v1/dashboard
 * - GET /overview          全平台用户、上游 Key、今日请求/token/成功率、近 30 天趋势
 * - GET /overview/models   按模型用量排行（period=today|7d|month）
 *
 * 注：时间口径以数据库会话时区为准（current_date / now()）。
 */
class Overview extends BaseController
{
    /**
     * 模型用量排行的 period 白名单：DB 会话时区下界（值仅来自本表，可安全拼入 whereRaw）
     */
    private const PERIOD_BOUNDS = [
        'today' => 'current_date',
        '7d'    => "current_date - interval '6 day'",
        'month' => 'date_trunc(\'month\', current_date)',
    ];

    /** GET /api/v1/dashboard/overview */
    public function overview()
    {
        $todayStart = date('Y-m-d 00:00:00');
        return success($this->adminOverview($todayStart));
    }

    /**
     * GET /api/v1/dashboard/overview/models?period=today|7d|month&limit=10
     *
     * 全平台按模型聚合用量，实际调用次数降序（次序 token 消耗）。
     */
    public function models()
    {
        $period = (string) $this->request->get('period', 'today');
        if (!isset(self::PERIOD_BOUNDS[$period])) {
            $period = 'today';
        }
        $limit = max(1, min(20, (int) $this->request->get('limit', 10)));

        return success($this->modelRank(null, $period, $limit));
    }

    /**
     * 按模型聚合用量排行（think-orm 查询构建器；null=全平台）。
     *
     * 时间下界走 DB 会话时区（current_date / date_trunc），与 panel 版口径一致；
     * NULL 模型名经 coalesce 别名显示为 unknown（group by 仍按原列，NULL 自成一组）。
     */
    private function modelRank(?string $userId, string $period, int $limit): array
    {
        $query = RequestLogModel::fieldRaw("coalesce(model_name,'unknown') as model_name")
            ->fieldRaw('count(*) as requests')
            ->fieldRaw('count(*) filter (where success is true) as successes')
            ->fieldRaw('coalesce(sum(total_tokens),0) as tokens')
            ->whereRaw('created_at >= ' . self::PERIOD_BOUNDS[$period]);
        if ($userId !== null) {
            $query->where('user_id', $userId);
        }
        $rows = $query->group('model_name')
            ->orderRaw('requests desc, tokens desc')
            ->limit($limit)
            ->select()
            ->toArray();

        return array_map(fn ($r) => [
            'model'     => $r['model_name'],
            'requests'  => (int) $r['requests'],
            'successes' => (int) $r['successes'],
            'tokens'    => (int) $r['tokens'],
        ], $rows);
    }

    /** 全平台指标 */
    private function adminOverview(string $todayStart): array
    {
        // 合并 3 个独立 count 为 1 个标量子查询，省 2 次 SSH 隧道 RTT（~300ms）
        $kpi = Db::connect('pgsql')->query(
            "select (select count(*) from users) as total_users,"
            . " (select count(*) from users where status = 'active') as active_users,"
            . " (select count(*) from upstream_keys where status = 'active') as active_upstream"
        )[0];
        $totalUsers        = (int) ($kpi['total_users'] ?? 0);
        $activeUsers       = (int) ($kpi['active_users'] ?? 0);
        $activeUpstreamKeys = (int) ($kpi['active_upstream'] ?? 0);

        $active7dFrom = date('Y-m-d 00:00:00', strtotime('-6 days'));
        $activeUsers7d = (int) (Db::connect('pgsql')->query(
            'select count(distinct user_id) as cnt from request_logs where created_at >= ?',
            [$active7dFrom]
        )[0]['cnt'] ?? 0);

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

    /** 今日请求统计：总数 / 成功数 / token 消耗 / 成功率（null=全平台） */
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
            'total'         => $total,
            'success_count' => $successCount,
            'tokens'        => (int) ($row['tokens'] ?? 0),
            'rate'          => $total > 0 ? round($successCount / $total, 4) : null,
        ];
    }

    /** 近 30 天每日趋势（null=全平台） */
    private function trend30(?string $userId): array
    {
        // 只查有数据的天（group by date_trunc 走并行扫描 ~940ms），PHP 侧补全 30 天零值。
        // 比 DB 侧 generate_series left join 省 ~560ms（join 30 行开销）。
        // 时区：DB 与 PHP 均为 UTC，current_date 与 date('Y-m-d') 一致。
        $sql = "select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,"
             . ' count(id) as requests,'
             . ' coalesce(sum(total_tokens),0) as tokens,'
             . " count(*) filter (where success is true) as successes"
             . " from request_logs where created_at >= current_date - interval '29 day'";
        $binds = [];
        if ($userId !== null) {
            $sql .= ' and user_id = ?';
            $binds[] = $userId;
        }
        $sql .= ' group by 1 order by 1';

        $rows = Db::connect('pgsql')->query($sql, $binds);
        $map = [];
        foreach ($rows as $r) {
            $map[$r['day']] = $r;
        }
        $out = [];
        for ($i = 29; $i >= 0; $i--) {
            $day = date('Y-m-d', strtotime("-{$i} days"));
            $r = $map[$day] ?? null;
            $out[] = [
                'day'       => $day,
                'requests'  => (int) ($r['requests'] ?? 0),
                'tokens'    => (int) ($r['tokens'] ?? 0),
                'successes' => (int) ($r['successes'] ?? 0),
            ];
        }
        return $out;
    }
}
