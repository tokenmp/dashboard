<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\UpstreamKey;
use app\model\User;
use think\facade\Db;

/**
 * 管理面概览（dashboard，全平台）
 *
 * 路由前缀 /api/v1/dashboard
 * - GET /overview  全平台用户、上游 Key、今日请求/token/成功率、近 30 天趋势
 *
 * 注：时间口径以数据库会话时区为准（current_date / now()）。
 */
class Overview extends BaseController
{
    /** GET /api/v1/dashboard/overview */
    public function overview()
    {
        $todayStart = date('Y-m-d 00:00:00');
        return success($this->adminOverview($todayStart));
    }

    /** 全平台指标 */
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
                'day'       => $r['day'],
                'requests'  => (int) ($r['requests'] ?? 0),
                'tokens'    => (int) ($r['tokens'] ?? 0),
                'successes' => (int) ($r['successes'] ?? 0),
            ];
        }, $rows);
    }
}
