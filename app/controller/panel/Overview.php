<?php
declare(strict_types=1);

namespace app\controller\panel;

use app\BaseController;
use app\model\RequestLog as RequestLogModel;
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
        $ctx    = DataScope::forSelf(app('user'));
        $userId = $ctx->userId();

        $today = $this->todayStats($userId);
        $total = $this->totalStats($userId);
        $trend = $this->trend30($userId);
        $quota = $this->userQuota($userId);

        return success([
            'role' => 'user',
            'kpi'  => [
                'todayRequests'    => $today['total'],
                'todayTokens'      => $today['tokens'],
                'todaySuccessRate' => $today['rate'],
                'totalRequests'    => $total['total'],
                'totalTokens'      => $total['tokens'],
            ],
            'quota' => $quota,
            'trend' => $trend,
        ]);
    }

    /**
     * 模型用量排行的 period 白名单：DB 会话时区下界（值仅来自本表，可安全拼入 whereRaw）
     */
    private const PERIOD_BOUNDS = [
        'today' => 'current_date',
        '7d'    => "current_date - interval '6 day'",
        'month' => 'date_trunc(\'month\', current_date)',
    ];

    /**
     * GET /api/v1/panel/overview/models?period=today|7d|month&limit=10
     *
     * 按模型聚合自身用量，实际调用次数降序（次序 token 消耗）。
     */
    public function models()
    {
        $ctx    = DataScope::forSelf(app('user'));
        $period = (string) $this->request->get('period', 'today');
        if (!isset(self::PERIOD_BOUNDS[$period])) {
            $period = 'today';
        }
        $limit = max(1, min(20, (int) $this->request->get('limit', 10)));

        return success($this->modelRank($ctx->userId(), $period, $limit));
    }

    /**
     * 按模型聚合用量排行（think-orm 查询构建器）。
     *
     * 时间下界走 DB 会话时区（current_date / date_trunc），与 todayStats/trend30 口径一致；
     * NULL 模型名经 coalesce 别名显示为 unknown（group by 仍按原列，NULL 自成一组）。
     */
    private function modelRank(string $userId, string $period, int $limit): array
    {
        $rows = RequestLogModel::fieldRaw("coalesce(model_name,'unknown') as model_name")
            ->fieldRaw('count(*) as requests')
            ->fieldRaw('count(*) filter (where success is true) as successes')
            ->fieldRaw('coalesce(sum(total_tokens),0) as tokens')
            ->whereRaw('created_at >= ' . self::PERIOD_BOUNDS[$period])
            ->where('user_id', $userId)
            ->group('model_name')
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

    /**
     * 今日请求统计：总数 / 成功数 / token 消耗 / 成功率
     *
     * 「今日」口径以数据库会话时区为准（current_date），与 trend30 一致，
     * 避免依赖 PHP date()（PHP 默认时区 Asia/Shanghai 与 PG 会话时区不一致时
     * 会导致「今天」边界错位、漏计当天数据）。
     */
    private function todayStats(string $userId): array
    {
        $row = Db::connect('pgsql')->query(
            'select count(*) as total,'
            . " count(*) filter (where success is true) as success_count,"
            . ' coalesce(sum(total_tokens),0) as tokens'
            . ' from request_logs where created_at >= current_date and user_id = ?',
            [$userId]
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
     * 全量请求统计：总数 / token 消耗（不限时间范围）
     */
    private function totalStats(string $userId): array
    {
        $row = Db::connect('pgsql')->query(
            'select count(*) as total, coalesce(sum(total_tokens),0) as tokens'
            . ' from request_logs where user_id = ?',
            [$userId]
        )[0];
        return [
            'total'  => (int) ($row['total'] ?? 0),
            'tokens' => (int) ($row['tokens'] ?? 0),
        ];
    }

    /**
     * 近 30 天每日趋势（请求/token/成功）。
     *
     * 用 generate_series 在 DB 侧生成 30 天骨架(以会话时区的 current_date 为准),
     * 左连 request_logs 按天分组——避免「DB 会话时区分组 + PHP date() 拼 key」两套
     * 时区口径不一致导致当天数据落空。
     */
    private function trend30(string $userId): array
    {
        $sql = "select to_char(d.day, 'YYYY-MM-DD') as day,"
             . ' coalesce(count(rl.id),0) as requests,'
             . ' coalesce(sum(rl.total_tokens),0) as tokens,'
             . " count(*) filter (where rl.success is true) as successes"
             . " from generate_series(current_date - interval '29 day', current_date, interval '1 day') as d(day)"
             . ' left join request_logs rl on date_trunc(\'day\', rl.created_at) = d.day and rl.user_id = ?'
             . ' group by d.day order by d.day';

        $rows = Db::connect('pgsql')->query($sql, [$userId]);
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'day'       => $r['day'],
                'requests'  => (int) $r['requests'],
                'tokens'    => (int) $r['tokens'],
                'successes' => (int) $r['successes'],
            ];
        }
        return $out;
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
