<?php
declare(strict_types=1);

namespace app\controller\panel;

use app\BaseController;
use app\service\DataScope;
use app\service\QuotaService;
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
     * 用户各计费类型的额度（套餐感知），委托 QuotaService 统一口径。
     * 与 dashboard 用户详情一致，对齐执行器 QuotaCapacitySQL（usage_ledger charge 行
     * 为「已用」、token 统一为「套餐额度 + 充值 − 已用 − 预扣」、coding 滚动窗口）。
     */
    private function userQuota(string $userId): array
    {
        return (new QuotaService())->summary($userId);
    }
}
