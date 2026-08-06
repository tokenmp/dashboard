<?php
declare(strict_types=1);

namespace app\service;

use think\facade\Db;

/**
 * 套餐感知额度服务（dashboard + panel 共用）
 *
 * 计算「真实可用额度」，算法对齐 Go 执行器（internal/postgres/quota.go 的
 * QuotaCapacitySQL / UserQuotaSQL），保证后台展示与执行器实际放行口径一致。
 *
 * 三种计费类型：
 *  - coding（编程套餐）：滚动窗口制。本周窗口 = date_trunc('week', now()
 *    AT TIME ZONE 'UTC') = 周一 00:00 UTC（中国时间周一 08:00）；近 5 小时
 *    为 now() - interval '5 hours'。「已用」取自 usage_ledger 的 charge 行
 *    （ledger_type='charge' 且 request_delta<0，取 -request_delta 求和），
 *    下限为「所选套餐 activated_at」，上限为 expires_at。多套餐时选「限额最
 *    宽松」的一条（对齐执行器的 selected_coding_plan）。
 *  - token（计量预付费 / 固定额度）：
 *    available = (Σ plans.token_limit + Σ 充值) − Σ charge − 预扣；
 *    charge 为全量累计（不限窗口）。
 *  - image（图像套餐）：固定额度。
 *    available = Σ plans.token_limit − Σ charge(套餐激活窗口内) − 预扣。
 *
 * ⚠️ Schema 说明：本服务面向「dump 基线」库（迁移 000047/048/049 之前），
 *    不引用 plans.daily_limit / total_limit、user_plans.*_delta、
 *    usage_ledger.billing_user_plan_id 等尚未存在的列。待库迁移到 048/049 后，
 *    可把 monthly_limit 换成 COALESCE(total_limit, monthly_limit)，并在限额上
 *    叠加 COALESCE(up.*_delta,0)，即可对齐执行器的逐套餐加量语义。
 */
class QuotaService
{
    /**
     * 用户额度汇总，返回与 panel/Overview 的 quota 字段同构的 QuotaItem[]。
     *
     * @param string $userId 用户 ID
     * @return list<array> 每个 billingPlan 一项（coding/token/image，仅当用户有该类套餐或流水时出现）
     */
    public function summary(string $userId): array
    {
        $plans         = $this->activePlansByType($userId);
        $codingPlanRow = $this->selectedCodingPlan($userId);
        $ledger        = $this->ledgerTotals($userId);
        $reserved      = $this->reservedTotals($userId);

        $items = [];
        if (($c = $this->codingItem($userId, $codingPlanRow, $reserved['coding']['requests'] ?? 0)) !== null) {
            $items[] = $c;
        }
        if (($t = $this->tokenItem($plans['token'] ?? null, $ledger['token'] ?? null, $reserved['token']['tokens'] ?? 0)) !== null) {
            $items[] = $t;
        }
        if (($i = $this->imageItem($userId, $plans['image'] ?? null, $reserved['image']['tokens'] ?? 0)) !== null) {
            $items[] = $i;
        }
        return $items;
    }

    /**
     * 兼容旧「usage」字段的扁平汇总（按 billingPlan 聚合的余额/已用），
     * 供尚未迁移到 QuotaItem[] 的调用方过渡使用；已用口径与 summary() 一致。
     *
     * @return list<array{billingPlan:string, tokenBalance:int, requestBalance:int}>
     */
    public function legacyUsage(string $userId): array
    {
        $ledger = $this->ledgerTotals($userId);
        $out    = [];
        foreach ($ledger as $plan => $row) {
            $out[] = [
                'billingPlan'    => $plan,
                'tokenBalance'   => $plan === 'coding' ? 0 : (int) (($row['recharged'] ?? 0) - ($row['used_tokens'] ?? 0)),
                'requestBalance' => $plan === 'coding' ? -(int) ($row['used_requests'] ?? 0) : 0,
            ];
        }
        return $out;
    }

    /* ============================== 套餐查询 ============================== */

    /**
     * 按 plan_type 聚合的有效套餐（token/image 用）：限额之和、最早激活、最晚过期。
     *
     * @return array<string,array{name:string,tokenLimit:int,minActivatedAt:?string,maxExpiresAt:?string}>
     */
    private function activePlansByType(string $userId): array
    {
        $rows = Db::connect('pgsql')->query(
            "select p.plan_type,"
            . " (array_agg(p.name order by up.activated_at desc))[1] as name,"
            . " coalesce(sum(p.token_limit),0) as token_limit_sum,"
            . " min(up.activated_at)::text as min_activated_at,"
            . " case when bool_or(up.expires_at is null) then null::text"
            . "      else max(up.expires_at)::text end as max_expires_at"
            . " from user_plans up join plans p on p.id = up.plan_id"
            . " where up.user_id = ? and up.status = 'active' and p.status = 'active'"
            . " and (up.expires_at is null or up.expires_at > now())"
            . " and p.plan_type in ('token','image')"
            . " group by p.plan_type",
            [$userId]
        );
        $map = [];
        foreach ($rows as $r) {
            $map[$r['plan_type']] = [
                'name'           => (string) $r['name'],
                'tokenLimit'     => (int) $r['token_limit_sum'],
                'minActivatedAt' => $r['min_activated_at'] !== null ? (string) $r['min_activated_at'] : null,
                'maxExpiresAt'   => $r['max_expires_at'] !== null ? (string) $r['max_expires_at'] : null,
            ];
        }
        return $map;
    }

    /**
     * 选定的 coding 套餐（多套餐时取限额最宽松的一条，对齐执行器 selected_coding_plan）。
     *
     * @return array{name:string,weeklyLimit:int,hourlyLimit:int,activatedAt:string,expiresAt:?string}|null
     */
    private function selectedCodingPlan(string $userId): ?array
    {
        $rows = Db::connect('pgsql')->query(
            "select p.name,"
            . " coalesce(p.weekly_limit,0) as weekly_limit,"
            . " coalesce(p.hourly_5h_limit,0) as hourly_5h_limit,"
            . " up.activated_at::text as activated_at,"
            . " up.expires_at::text as expires_at"
            . " from user_plans up join plans p on p.id = up.plan_id"
            . " where up.user_id = ? and up.plan_type = 'coding' and up.status = 'active' and p.status = 'active'"
            . " and (up.expires_at is null or up.expires_at > now())"
            . " order by coalesce(p.monthly_limit,0) desc, coalesce(p.weekly_limit,0) desc,"
            . " coalesce(p.hourly_5h_limit,0) desc, up.activated_at desc"
            . " limit 1",
            [$userId]
        );
        if (empty($rows)) {
            return null;
        }
        $r = $rows[0];
        return [
            'name'        => (string) $r['name'],
            'weeklyLimit' => (int) $r['weekly_limit'],
            'hourlyLimit' => (int) $r['hourly_5h_limit'],
            'activatedAt' => (string) $r['activated_at'],
            'expiresAt'   => $r['expires_at'] !== null ? (string) $r['expires_at'] : null,
        ];
    }

    /* ============================== 流水 / 预扣 ============================== */

    /**
     * usage_ledger 按 billing_plan 聚合：charge 已用（token / 请求）、recharge 充值。
     * token 已用为全量累计；此处不套窗口（窗口仅在 codingItem 内单独算）。
     *
     * @return array<string,array{used_tokens:int,recharged:int,used_requests:int}>
     */
    private function ledgerTotals(string $userId): array
    {
        $rows = Db::connect('pgsql')->query(
            "select billing_plan,"
            . " coalesce(sum(case when ledger_type='charge' and token_delta<0 then -token_delta else 0 end),0) as used_tokens,"
            . " coalesce(sum(case when ledger_type='recharge' and billing_plan='token' and token_delta>0 then token_delta else 0 end),0) as recharged,"
            . " coalesce(sum(case when ledger_type='charge' and request_delta<0 then -request_delta else 0 end),0) as used_requests"
            . " from usage_ledger where user_id = ? group by billing_plan",
            [$userId]
        );
        $map = [];
        foreach ($rows as $r) {
            $map[$r['billing_plan']] = [
                'used_tokens'   => (int) $r['used_tokens'],
                'recharged'     => (int) $r['recharged'],
                'used_requests' => (int) $r['used_requests'],
            ];
        }
        return $map;
    }

    /**
     * quota_reservations 当前有效预扣（status='reserved' 且未过期）。
     *
     * @return array<string,array{tokens:int,requests:int}>
     */
    private function reservedTotals(string $userId): array
    {
        $rows = Db::connect('pgsql')->query(
            "select billing_plan,"
            . " coalesce(sum(reserved_tokens),0) as reserved_tokens,"
            . " coalesce(sum(reserved_requests),0) as reserved_requests"
            . " from quota_reservations where user_id = ? and status = 'reserved' and expires_at > now()"
            . " group by billing_plan",
            [$userId]
        );
        $map = [];
        foreach ($rows as $r) {
            $map[$r['billing_plan']] = [
                'tokens'   => (int) $r['reserved_tokens'],
                'requests' => (int) $r['reserved_requests'],
            ];
        }
        return $map;
    }

    /* ============================== 单项组装 ============================== */

    /**
     * coding：滚动窗口（本周 / 近 5 小时）。$exp 为 null 表示永久有效（无上界）。
     *
     * @param array{requests:int} $reserved
     */
    private function codingItem(string $userId, ?array $plan, int $reserved): ?array
    {
        if ($plan === null) {
            return null; // 无有效 coding 套餐则不展示（执行器也不会放行 coding 请求）
        }
        $act = $plan['activatedAt'];
        $exp = $plan['expiresAt']; // string|null

        // usage_ledger charge 行按窗口聚合：下限 = greatest(本周一 UTC, activated_at)，
        // 上限 = expires_at（NULL 时无上界）。$exp 绑定为 null → ?::timestamptz is null 成立。
        $row = Db::connect('pgsql')->query(
            "select"
            . " coalesce(sum(case when created_at >= greatest((date_trunc('week', now() at time zone 'UTC') at time zone 'UTC'), ?::timestamptz)"
            . " and (?::timestamptz is null or created_at <= ?::timestamptz) then -request_delta else 0 end),0) as week_used,"
            . " coalesce(sum(case when created_at >= greatest(now() - interval '5 hours', ?::timestamptz)"
            . " and (?::timestamptz is null or created_at <= ?::timestamptz) then -request_delta else 0 end),0) as h5_used"
            . " from usage_ledger where user_id = ? and billing_plan = 'coding' and ledger_type = 'charge' and request_delta < 0",
            [$act, $exp, $exp, $act, $exp, $exp, $userId]
        )[0];
        $weekUsed = (int) ($row['week_used'] ?? 0);
        $h5Used   = (int) ($row['h5_used'] ?? 0);

        $wkLimit = $plan['weeklyLimit'];
        $h5Limit = $plan['hourlyLimit'];
        return [
            'billingPlan' => 'coding',
            'planName'    => $plan['name'],
            'unit'        => 'requests',
            'mode'        => 'window',
            'total'       => $wkLimit > 0 ? $wkLimit : null,
            'windows'     => [
                ['key' => 'week', 'label' => '本周',     'limit' => $wkLimit > 0 ? $wkLimit : null, 'used' => $weekUsed],
                ['key' => 'h5',   'label' => '近 5 小时', 'limit' => $h5Limit > 0 ? $h5Limit : null, 'used' => $h5Used],
            ],
            'reserved'    => $reserved,
        ];
    }

    /**
     * token：计量预付费 / 固定额度统一模型。
     * available = (planTokens + recharged) − used − reserved。
     *
     * @param array{name:string,tokenLimit:int,minActivatedAt:?string,maxExpiresAt:?string}|null $plan
     * @param array{used_tokens:int,recharged:int,used_requests:int}|null $ledger
     */
    private function tokenItem(?array $plan, ?array $ledger, int $reserved): ?array
    {
        $hasPlan   = $plan !== null;
        $hasLedger = $ledger !== null;
        if (!$hasPlan && !$hasLedger) {
            return null;
        }
        $planTokens = $hasPlan ? $plan['tokenLimit'] : 0;
        $recharged  = $ledger['recharged'] ?? 0;
        $used       = $ledger['used_tokens'] ?? 0;
        $cap        = $planTokens + $recharged;            // 总额度 = 套餐 + 充值
        $available  = max(0, $cap - $used - $reserved);

        if ($planTokens > 0) {
            // 固定额度套餐（可能叠加充值）：已用 / 限额 / 剩余
            return [
                'billingPlan' => 'token',
                'planName'    => $hasPlan ? $plan['name'] : null,
                'unit'        => 'tokens',
                'mode'        => 'capped',
                'total'       => $cap,
                'limit'       => $planTokens,
                'used'        => $used,
                'reserved'    => $reserved,
                'recharged'   => $recharged,
                'available'   => $available,
            ];
        }
        // 纯计量预付费：余额 / 预扣 / 可用
        return [
            'billingPlan' => 'token',
            'planName'    => $hasPlan ? $plan['name'] : null,
            'unit'        => 'tokens',
            'mode'        => 'balance',
            'balance'     => max(0, $recharged - $used),
            'used'        => $used,
            'reserved'    => $reserved,
            'available'   => $available,
        ];
    }

    /**
     * image：固定额度，已用按套餐激活窗口计算。
     *
     * @param array{name:string,tokenLimit:int,minActivatedAt:?string,maxExpiresAt:?string}|null $plan
     */
    private function imageItem(string $userId, ?array $plan, int $reserved): ?array
    {
        if ($plan === null) {
            return null; // 无 image 套餐不展示（执行器需 image 套餐才放行）
        }
        $act = $plan['minActivatedAt'];
        $exp = $plan['maxExpiresAt']; // string|null
        $row = Db::connect('pgsql')->query(
            "select coalesce(sum(-token_delta),0) as used"
            . " from usage_ledger where user_id = ? and billing_plan = 'image' and ledger_type = 'charge' and token_delta < 0"
            . " and created_at >= ?::timestamptz and (?::timestamptz is null or created_at < ?::timestamptz)",
            [$userId, $act, $exp, $exp]
        )[0];
        $used   = (int) ($row['used'] ?? 0);
        $limit  = $plan['tokenLimit'];
        $avail  = max(0, $limit - $used - $reserved);
        return [
            'billingPlan' => 'image',
            'planName'    => $plan['name'],
            'unit'        => 'tokens',
            'mode'        => 'capped',
            'total'       => $limit,
            'limit'       => $limit,
            'used'        => $used,
            'reserved'    => $reserved,
            'available'   => $avail,
        ];
    }
}
