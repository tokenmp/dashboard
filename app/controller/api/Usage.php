<?php
declare(strict_types=1);

namespace app\controller\api;

use app\BaseController;
use app\model\PriceMultiplierRule;
use app\model\QuotaReservation;
use app\model\UsageLedger;
use app\service\DataScope;
use app\support\Pagination;
use think\facade\Db;

/**
 * 计费用量
 *
 * 路由前缀 /api/usage、/api/price
 *
 * - GET /api/usage/ledger    流水（分页+按 ledger_type/billing_plan/userId/时间），user 仅自己
 * - GET /api/usage/quota    admin：按用户 Top-N + 全平台额度池；user：自身各计费类型 已充/已用/预扣/可用
 * - GET /api/price/rules    计费倍率规则列表（admin 全局）
 *
 * 计费口径：
 * - coding 按 request_delta（请求次数）
 * - token / image 按 token_delta
 * 「可用 = Σ正项 − Σ|负项| − 当前 reserved 未终态」
 */
class Usage extends BaseController
{
    /**
     * GET /api/usage/ledger
     */
    public function ledger()
    {
        $ctx = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = UsageLedger::where('user_id', '<>', null);
        $query = $ctx->scope($query, 'user_id', (string) $this->request->get('userId', ''));

        $ledgerType = trim((string) $this->request->get('ledgerType', ''));
        if ($ledgerType !== '') {
            $query->where('ledger_type', $ledgerType);
        }
        $billingPlan = trim((string) $this->request->get('billingPlan', ''));
        if ($billingPlan !== '') {
            $query->where('billing_plan', $billingPlan);
        }
        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at'], '-created_at');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /**
     * GET /api/usage/quota
     */
    public function quota()
    {
        $ctx = DataScope::forUser(app('user'));
        return $ctx->isAdmin() ? success($this->adminQuota()) : success($this->userQuota($ctx->userId()));
    }

    /**
     * admin：全平台额度池 + Top-N 用户
     */
    private function adminQuota(): array
    {
        // 全平台：按 billing_plan 汇总 usage_ledger
        $platform = Db::connect('pgsql')->query(
            "select coalesce(billing_plan, 'unknown') as billing_plan,"
            . " coalesce(sum(token_delta),0) as token_balance,"
            . " coalesce(sum(request_delta),0) as request_balance"
            . " from usage_ledger group by billing_plan order by billing_plan"
        );
        $platformReserved = Db::connect('pgsql')->query(
            "select coalesce(billing_plan, 'unknown') as billing_plan,"
            . " coalesce(sum(reserved_tokens),0) as reserved_tokens,"
            . " coalesce(sum(reserved_requests),0) as reserved_requests"
            . " from quota_reservations where status = 'reserved' group by billing_plan"
        );
        $reservedMap = [];
        foreach ($platformReserved as $r) {
            $reservedMap[$r['billing_plan']] = ['tokens' => (int) $r['reserved_tokens'], 'requests' => (int) $r['reserved_requests']];
        }
        $plans = [];
        foreach ($platform as $p) {
            $plan = $p['billing_plan'];
            $byReq = $plan === 'coding';
            $res = $reservedMap[$plan] ?? ['tokens' => 0, 'requests' => 0];
            $balance = $byReq ? (int) $p['request_balance'] : (int) $p['token_balance'];
            $reserve = $byReq ? $res['requests'] : $res['tokens'];
            $plans[] = [
                'billingPlan' => $plan,
                'unit' => $byReq ? 'requests' : 'tokens',
                'balance' => $balance,
                'reserved' => $reserve,
                'available' => $balance - $reserve,
            ];
        }

        // Top-N 用户（按 |token_delta|+|request_delta| 绝对消耗排序）
        $topN = (int) $this->request->get('topN', 10);
        $topN = max(1, min(50, $topN));
        $users = Db::connect('pgsql')->query(
            "select u.id, u.email, u.role,"
            . " coalesce(sum(ul.token_delta),0) as token_balance,"
            . " coalesce(sum(ul.request_delta),0) as request_balance"
            . " from usage_ledger ul join users u on u.id = ul.user_id"
            . " group by u.id, u.email, u.role"
            . " order by abs(coalesce(sum(ul.token_delta),0)) + abs(coalesce(sum(ul.request_delta),0)) desc"
            . " limit ?",
            [$topN]
        );
        $topUsers = array_map(static function ($r) {
            return [
                'id' => $r['id'],
                'email' => $r['email'],
                'role' => $r['role'],
                'tokenBalance' => (int) $r['token_balance'],
                'requestBalance' => (int) $r['request_balance'],
            ];
        }, $users);

        return ['role' => 'admin', 'platform' => $plans, 'topUsers' => $topUsers];
    }

    /**
     * user：自身各计费类型 已充/已用/预扣/可用
     */
    private function userQuota(string $userId): array
    {
        // 已充（正项 delta > 0）/ 已用（|负项|）/ 余额（净和）
        $balances = Db::connect('pgsql')->query(
            "select coalesce(billing_plan, 'unknown') as billing_plan,"
            . " coalesce(sum(token_delta),0) as token_balance,"
            . " coalesce(sum(case when token_delta > 0 then token_delta else 0 end),0) as token_charged_in,"
            . " coalesce(sum(case when token_delta < 0 then abs(token_delta) else 0 end),0) as token_used,"
            . " coalesce(sum(request_delta),0) as request_balance,"
            . " coalesce(sum(case when request_delta > 0 then request_delta else 0 end),0) as request_charged_in,"
            . " coalesce(sum(case when request_delta < 0 then abs(request_delta) else 0 end),0) as request_used"
            . " from usage_ledger where user_id = ? group by billing_plan order by billing_plan",
            [$userId]
        );
        $reserved = Db::connect('pgsql')->query(
            "select coalesce(billing_plan, 'unknown') as billing_plan,"
            . " coalesce(sum(reserved_tokens),0) as reserved_tokens,"
            . " coalesce(sum(reserved_requests),0) as reserved_requests"
            . " from quota_reservations where user_id = ? and status = 'reserved' group by billing_plan",
            [$userId]
        );
        $reservedMap = [];
        foreach ($reserved as $r) {
            $reservedMap[$r['billing_plan']] = ['tokens' => (int) $r['reserved_tokens'], 'requests' => (int) $r['reserved_requests']];
        }

        $plans = [];
        foreach ($balances as $b) {
            $plan = $b['billing_plan'];
            $byReq = $plan === 'coding';
            $res = $reservedMap[$plan] ?? ['tokens' => 0, 'requests' => 0];
            $balance = $byReq ? (int) $b['request_balance'] : (int) $b['token_balance'];
            $used = $byReq ? (int) $b['request_used'] : (int) $b['token_used'];
            $chargedIn = $byReq ? (int) $b['request_charged_in'] : (int) $b['token_charged_in'];
            $reserve = $byReq ? $res['requests'] : $res['tokens'];
            $plans[] = [
                'billingPlan' => $plan,
                'unit' => $byReq ? 'requests' : 'tokens',
                'balance' => $balance,
                'chargedIn' => $chargedIn,
                'used' => $used,
                'reserved' => $reserve,
                'available' => $balance - $reserve,
            ];
        }
        return ['role' => 'user', 'plans' => $plans];
    }

    /**
     * GET /api/price/rules（admin 全局）
     */
    public function rules()
    {
        $ctx = DataScope::forUser(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = PriceMultiplierRule::where('status', '<>', 'deleted');
        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->whereLike('exclusive_group', "%{$keyword}%");
        }
        $protocol = trim((string) $this->request->get('protocol', ''));
        if ($protocol !== '') {
            $query->where('protocol', $protocol);
        }
        $composeMode = trim((string) $this->request->get('composeMode', ''));
        if ($composeMode !== '') {
            $query->where('compose_mode', $composeMode);
        }
        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'priority'], '-priority');
        $list = $query->page($page, $size)->select();

        // PostgreSQL integer[]（days_of_week）转真数组
        $data = $list->toArray();
        foreach ($data as &$r) {
            $r['days_of_week'] = self::parseIntArray($r['days_of_week'] ?? null);
        }
        unset($r);
        return success(Pagination::wrap($data, $total, $page, $size));
    }

    /** 解析 PostgreSQL integer[] 字面量为 int 数组 */
    private static function parseIntArray($value): array
    {
        if (is_array($value)) {
            return array_map('intval', $value);
        }
        if (!is_string($value) || $value === '') {
            return [];
        }
        $s = trim($value);
        if ($s === '{}') {
            return [];
        }
        if (str_starts_with($s, '{') && str_ends_with($s, '}')) {
            $inner = substr($s, 1, -1);
            if ($inner === '') {
                return [];
            }
            return array_map('intval', array_map('trim', explode(',', $inner)));
        }
        return [(int) $s];
    }
}
