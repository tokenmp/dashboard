<?php
declare(strict_types=1);

namespace app\controller\panel;

use app\BaseController;
use app\model\UsageLedger;
use app\service\DataScope;
use app\support\Pagination;
use think\facade\Db;

/**
 * 用户面：我的用量（panel，自取）
 *
 * 路由前缀 /api/v1/panel/usage
 * - GET /ledger   我的用量流水（分页+按 ledger_type/billing_plan/时间）
 * - GET /quota    自身各计费类型 已充/已用/预扣/可用
 *
 * 计费口径：coding 按 request_delta（请求次数）；token / image 按 token_delta。
 */
class Usage extends BaseController
{
    /** GET /api/v1/panel/usage/ledger */
    public function ledger()
    {
        $ctx = DataScope::forSelf(app('user'));
        [$page, $size] = Pagination::page($this->request);

        $query = UsageLedger::where('user_id', '<>', null);
        $query = $ctx->scope($query, 'user_id'); // 强制 self

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

    /** GET /api/v1/panel/usage/quota */
    public function quota()
    {
        $ctx = DataScope::forSelf(app('user'));
        return success($this->userQuota($ctx->userId()));
    }

    /**
     * 自身各计费类型 已充/已用/预扣/可用
     */
    private function userQuota(string $userId): array
    {
        $balances = Db::connect('pgsql')->query(
            "select coalesce(billing_plan, 'unknown') as billing_plan,"
            . ' coalesce(sum(token_delta),0) as token_balance,'
            . ' coalesce(sum(case when token_delta > 0 then token_delta else 0 end),0) as token_charged_in,'
            . ' coalesce(sum(case when token_delta < 0 then abs(token_delta) else 0 end),0) as token_used,'
            . ' coalesce(sum(request_delta),0) as request_balance,'
            . ' coalesce(sum(case when request_delta > 0 then request_delta else 0 end),0) as request_charged_in,'
            . ' coalesce(sum(case when request_delta < 0 then abs(request_delta) else 0 end),0) as request_used'
            . ' from usage_ledger where user_id = ? group by billing_plan order by billing_plan',
            [$userId]
        );
        $reserved = Db::connect('pgsql')->query(
            "select coalesce(billing_plan, 'unknown') as billing_plan,"
            . ' coalesce(sum(reserved_tokens),0) as reserved_tokens,'
            . ' coalesce(sum(reserved_requests),0) as reserved_requests'
            . " from quota_reservations where user_id = ? and status = 'reserved' group by billing_plan",
            [$userId]
        );
        $reservedMap = [];
        foreach ($reserved as $r) {
            $reservedMap[$r['billing_plan']] = ['tokens' => (int) $r['reserved_tokens'], 'requests' => (int) $r['reserved_requests']];
        }

        $plans = [];
        foreach ($balances as $b) {
            $plan    = $b['billing_plan'];
            $byReq   = $plan === 'coding';
            $res     = $reservedMap[$plan] ?? ['tokens' => 0, 'requests' => 0];
            $balance = $byReq ? (int) $b['request_balance'] : (int) $b['token_balance'];
            $used    = $byReq ? (int) $b['request_used'] : (int) $b['token_used'];
            $chargedIn = $byReq ? (int) $b['request_charged_in'] : (int) $b['token_charged_in'];
            $reserve = $byReq ? $res['requests'] : $res['tokens'];
            $plans[] = [
                'billingPlan' => $plan,
                'unit'        => $byReq ? 'requests' : 'tokens',
                'balance'     => $balance,
                'chargedIn'   => $chargedIn,
                'used'        => $used,
                'reserved'    => $reserve,
                'available'   => $balance - $reserve,
            ];
        }
        return ['role' => 'user', 'plans' => $plans];
    }
}
