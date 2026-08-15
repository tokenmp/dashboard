<?php
declare(strict_types=1);

namespace app\service;

use app\enums\CodingPlanStrategy;
use think\facade\Db;

/**
 * 套餐感知额度服务（dashboard + panel 共用）
 *
 * 计算「真实可用额度」，算法对齐 Go 执行器（internal/postgres/quota.go 的
 * QuotaCapacitySQL / UserQuotaSQL），保证后台展示与执行器实际放行口径一致。
 *
 * 三种计费类型：
 *  - coding（编程套餐）：滚动窗口制。本周窗口 = date_trunc('week', now()
 *    AT TIME ZONE 'Asia/Shanghai') = 北京时间周一 00:00（与周期窗日切口径一致）；近 5 小时
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
 *    可把 cycle_limit 换成 COALESCE(total_limit, cycle_limit)，并在限额上
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
        $plans          = $this->activePlansByType($userId);
        $codingPlanRows = $this->allCodingPlans($userId);
        $ledger         = $this->ledgerTotals($userId);
        $reserved       = $this->reservedTotals($userId);
        $reservedByPlan = $this->reservedByCodingPlan($userId);

        $items = [];
        // coding 逐套餐输出（多套餐共存时用户应看到每一张卡的独立额度；顺序=执行器 fallback 优先级）
        foreach ($codingPlanRows as $row) {
            $bindingId = $row['bindingId'];
            if (($c = $this->codingItem($userId, $row, $reservedByPlan[$bindingId] ?? 0)) !== null) {
                $items[] = $c;
            }
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
                'requestBalance' => $plan === 'coding' ? -(float) ($row['used_requests'] ?? 0) : 0,
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
     * 全部 active coding 套餐（多套餐共存时逐卡展示；排序对齐执行器 listActiveCodingPlans：
     * cycle→weekly→5h→activated 降序，即扣费优先级）。
     *
     * @return list<array{name:string,bindingId:string,cycleLimit:?int,weeklyLimit:int,rolling5hLimit:int,cycleDays:?int,totalLimit:?int,activatedAt:string,windowsResetAt:?string,expiresAt:?string}>
     */
    private function allCodingPlans(string $userId): array
    {
        // 每套餐四维剩余的最小值（与执行器 listActiveCodingPlansQuery 的 LATERAL 同口径），
        // 供 least/most_remaining 策略排序。
        $cd  = "greatest(coalesce(coalesce(p.cycle_days, p.default_duration_days), 31), 1)";
        $chg = "ul.user_id = ? and ul.billing_plan = 'coding' and ul.ledger_type = 'charge' and ul.request_delta < 0 and ul.user_plan_id = up.id";
        $shortFloor = "greatest(up.activated_at, coalesce(up.windows_reset_at, '-infinity'::timestamptz))";
        $weekStart  = "(date_trunc('week', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')";
        $weekEnd    = "((date_trunc('week', now() at time zone 'Asia/Shanghai') + interval '7 days') at time zone 'Asia/Shanghai')";
        $rows = Db::connect('pgsql')->query(
            "select p.name,"
            . " p.cycle_limit,"
            . " coalesce(p.weekly_limit,0) as weekly_limit,"
            . " coalesce(p.rolling_5h_limit,0) as rolling_5h_limit,"
            . " p.cycle_days, p.default_duration_days, p.total_limit,"
            . " up.activated_at::text as activated_at,"
            . " up.windows_reset_at::text as windows_reset_at,"
            . " up.expires_at::text as expires_at,"
            . " up.id::text as binding_id,"
            . " rem.least_remaining"
            . " from user_plans up join plans p on p.id = up.plan_id"
            . " left join lateral ("
            . "   with fw as (select ((date_trunc('day', (up.activated_at at time zone 'Asia/Shanghai') + make_interval(days => {$cd})) + interval '1 day' - interval '1 second') at time zone 'Asia/Shanghai') as first_window_end),"
            . "   wi as (select *, case when now() <= first_window_end then 0 else floor(extract(epoch from (now() - (first_window_end + interval '1 second'))) / ({$cd}::bigint * 86400))::int + 1 end as cycles_after_first from fw),"
            . "   win as (select *,"
            . "     case when cycles_after_first = 0 then up.activated_at else first_window_end + make_interval(days => (cycles_after_first - 1) * {$cd}) + interval '1 second' end as cycle_window_start,"
            . "     case when up.expires_at is not null and up.expires_at < (first_window_end + make_interval(days => cycles_after_first * {$cd})) then up.expires_at else first_window_end + make_interval(days => cycles_after_first * {$cd}) end as cycle_window_end"
            . "   from wi)"
            . "   select least("
            . "     case when coalesce(p.cycle_limit,0) = 0 then 2147483647 else coalesce(p.cycle_limit,0) - coalesce((select sum(-ul.request_delta) from usage_ledger ul where {$chg} and ul.created_at >= win.cycle_window_start and ul.created_at <= win.cycle_window_end), 0) end,"
            . "     case when coalesce(p.weekly_limit,0) = 0 then 2147483647 else coalesce(p.weekly_limit,0) - coalesce((select sum(-ul.request_delta) from usage_ledger ul where {$chg} and ul.created_at >= greatest({$weekStart}, {$shortFloor}) and ul.created_at < {$weekEnd}), 0) end,"
            . "     case when coalesce(p.rolling_5h_limit,0) = 0 then 2147483647 else coalesce(p.rolling_5h_limit,0) - coalesce((select sum(-ul.request_delta) from usage_ledger ul where {$chg} and ul.created_at >= greatest(now() - interval '5 hours', {$shortFloor})), 0) end,"
            . "     case when coalesce(p.total_limit,0) = 0 then 2147483647 else coalesce(p.total_limit,0) - coalesce((select sum(-ul.request_delta) from usage_ledger ul where {$chg} and ul.created_at >= up.activated_at), 0) end"
            . "   )::bigint as least_remaining from win"
            . " ) rem on true"
            . " where up.user_id = ? and up.plan_type = 'coding' and up.status = 'active' and p.status = 'active'"
            . " and (up.expires_at is null or up.expires_at > now())",
            array_fill(0, 5, $userId) // 4×LATERAL 用量过滤 + 1×主查询
        );
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'name'           => (string) $r['name'],
                'bindingId'      => (string) $r['binding_id'],
                'cycleLimit'     => $r['cycle_limit'] !== null ? (int) $r['cycle_limit'] : null,
                'weeklyLimit'    => (int) $r['weekly_limit'],
                'rolling5hLimit' => (int) $r['rolling_5h_limit'],
                'cycleDays'      => $r['cycle_days'] !== null ? (int) $r['cycle_days'] : ($r['default_duration_days'] !== null ? (int) $r['default_duration_days'] : null),
                'totalLimit'     => $r['total_limit'] !== null ? (int) $r['total_limit'] : null,
                'activatedAt'    => (string) $r['activated_at'],
                'windowsResetAt' => $r['windows_reset_at'] !== null ? (string) $r['windows_reset_at'] : null,
                'expiresAt'      => $r['expires_at'] !== null ? (string) $r['expires_at'] : null,
                'leastRemaining' => (int) ($r['least_remaining'] ?? 2147483647),
            ];
        }
        // 按用户策略排序（枚举比较器，与执行器 plan_strategy.go 同规则）
        $stored = Db::connect('pgsql')->query(
            'select coding_plan_strategy from users where id = ?',
            [$userId],
        )[0]['coding_plan_strategy'] ?? null;
        $this->sortCodingPlansByStrategy($out, CodingPlanStrategy::parseListLenient($stored));
        return $out;
    }

    /** 按策略列表稳定排序套餐行（与执行器 Go 比较器同规则；负数=a 先扣）。 */
    private function sortCodingPlansByStrategy(array &$plans, array $strategies): void
    {
        usort($plans, function (array $a, array $b) use ($strategies): int {
            foreach ($strategies as $s) {
                /** @var CodingPlanStrategy $s */
                $r = match ($s) {
                    CodingPlanStrategy::LargestLimit  => $this->compareLimits($b, $a),
                    CodingPlanStrategy::SmallestLimit => $this->compareLimits($a, $b),
                    CodingPlanStrategy::LeastRemaining => $a['leastRemaining'] <=> $b['leastRemaining'],
                    CodingPlanStrategy::MostRemaining  => $b['leastRemaining'] <=> $a['leastRemaining'],
                    CodingPlanStrategy::SoonestExpiry => $this->compareExpiry($a, $b),
                    CodingPlanStrategy::LatestExpiry  => $this->compareExpiry($b, $a, false),
                    CodingPlanStrategy::OldestFirst   => strtotime($a['activatedAt']) <=> strtotime($b['activatedAt']),
                    CodingPlanStrategy::NewestFirst   => strtotime($b['activatedAt']) <=> strtotime($a['activatedAt']),
                };
                if ($r !== 0) {
                    return $r;
                }
            }
            return 0;
        });
    }

    /** 限额比较（cycle→weekly→5h），$asc=false 为降序。 */
    private function compareLimits(array $a, array $b): int
    {
        foreach (['cycleLimit', 'weeklyLimit', 'rolling5hLimit'] as $k) {
            $r = ($a[$k] ?? 0) <=> ($b[$k] ?? 0);
            if ($r !== 0) {
                return $r;
            }
        }
        return 0;
    }

    /** 到期比较；永久（null）永远殿后。$soonest=true 最近到期优先。 */
    private function compareExpiry(array $a, array $b, bool $soonest = true): int
    {
        $ea = $a['expiresAt'] !== null ? strtotime($a['expiresAt']) : null;
        $eb = $b['expiresAt'] !== null ? strtotime($b['expiresAt']) : null;
        if ($ea === null && $eb === null) {
            return 0;
        }
        if ($ea === null) {
            return 1;
        }
        if ($eb === null) {
            return -1;
        }
        return $soonest ? $ea <=> $eb : $eb <=> $ea;
    }

    /* ============================== 流水 / 预扣 ============================== */

    /**
     * usage_ledger 按 billing_plan 聚合：charge 已用（token / 请求）、recharge 充值。
     * token 已用为全量累计；此处不套窗口（窗口仅在 codingItem 内单独算）。
     *
     * @return array<string,array{used_tokens:int,recharged:int,used_requests:float}>
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
                'used_requests' => (float) $r['used_requests'],
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

    /** coding 各绑定的未过期预留请求数（多套餐逐卡展示用，对齐执行器 per-plan 口径）。
     * @return array<string,int> bindingId => reserved requests
     */
    private function reservedByCodingPlan(string $userId): array
    {
        $rows = Db::connect('pgsql')->query(
            "select user_plan_id::text as binding_id, coalesce(sum(reserved_requests),0) as reserved_requests"
            . " from quota_reservations"
            . " where user_id = ? and billing_plan = 'coding' and status = 'reserved' and expires_at > now()"
            . " and user_plan_id is not null"
            . " group by user_plan_id",
            [$userId]
        );
        $map = [];
        foreach ($rows as $r) {
            $map[$r['binding_id']] = (int) $r['reserved_requests'];
        }
        return $map;
    }

    /* ============================== 单项组装 ============================== */

    /**
     * coding：额度展示（面板口径）。
     *
     * 周期 cycle_days = COALESCE(plans.cycle_days, default_duration_days)（向后兼容老套餐）。
     * 各限额为「各自独立的滚动窗口」（互不套住）：
     *   5h=近 5 小时；周=UTC 当周；月=当前计费周期窗口（自 activated_at 滚动）；
     *   总(total_limit)=自激活起累计，永不刷新。
     * 仅渲染 limit>0 的窗口；全不限时回退展示当前周期已用，避免空白。
     *
     * 注意：本口径为面板展示用；执行器目前仍按「周期套住周/5h」的旧模型放行，待后续对齐。
     * 多套餐共存时每个绑定各出一张卡：用量/预留均按 user_plan_id 隔离（对齐执行器 per-plan 容量）。
     */
    private function codingItem(string $userId, ?array $plan, int $reserved): ?array
    {
        if ($plan === null) {
            return null; // 无有效 coding 套餐则不展示（执行器也不会放行 coding 请求）
        }
        $act        = $plan['activatedAt'];
        $exp        = $plan['expiresAt'];   // string|null
        $wra        = $plan['windowsResetAt'] ?? null; // 短期窗(5h/周)重置锚点；null=从未重置
        $cycleDays  = $plan['cycleDays'];   // COALESCE(cycle_days, default_duration_days)；null→31
        $cycleLimit = $plan['cycleLimit'];
        $weekLimit  = $plan['weeklyLimit'];
        $h5Limit    = $plan['rolling5hLimit'];
        $totalLimit = $plan['totalLimit'];

        $hasCap = ($cycleLimit !== null && $cycleLimit > 0)
            || $weekLimit > 0 || $h5Limit > 0
            || ($totalLimit !== null && $totalLimit > 0);
        $billingModel = $this->billingModel($cycleDays, $hasCap);
        $isPermanent  = ($cycleDays ?? 0) >= 3650; // 永久：周期公式会溢出 int4，且语义为「总量不刷新」

        // 公共片段：5h / 周 / 总 三个独立窗口（以 [activated_at, expires_at] 为界，互不套住）。
        // 5h/周下界纳入短期窗重置锚点 wra（GREATEST 忽略 NULL）；周期窗与总量仍只认 act
        $windowConds = [
            'h5'    => "created_at >= greatest(now() - interval '5 hours', b.act, b.wra)"
                     . " and (b.exp is null or created_at <= b.exp)",
            'week'  => "created_at >= greatest((date_trunc('week', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai'), b.act, b.wra)"
                     . " and created_at < ((date_trunc('week', now() at time zone 'Asia/Shanghai') + interval '7 days') at time zone 'Asia/Shanghai')"
                     . " and (b.exp is null or created_at <= b.exp)",
            'total' => "created_at >= b.act and (b.exp is null or created_at <= b.exp)",
        ];
        $independentUsed = ''
            . " coalesce(sum(case when {$windowConds['h5']} then -request_delta else 0 end), 0) as h5_used,"
            . " coalesce(sum(case when {$windowConds['week']} then -request_delta else 0 end), 0) as week_used,"
            . " coalesce(sum(case when {$windowConds['total']} then -request_delta else 0 end), 0) as total_used";
        // 实际请求数（区别于带倍率的扣费次数）：同窗口条件下去重计请求条目。
        // 老数据 request_log_id 为空时计 0，前端仅在 >0 且 ≠used 时展示。
        $independentActual = ''
            . " count(distinct case when {$windowConds['h5']} then request_log_id end) as h5_actual,"
            . " count(distinct case when {$windowConds['week']} then request_log_id end) as week_actual,"
            . " count(distinct case when {$windowConds['total']} then request_log_id end) as total_actual";

        if ($isPermanent) {
            // 永久套餐：不计算月周期窗口（避免 cycle_days*86400 溢出 int4）
            $row = Db::connect('pgsql')->query(
                "with b as (select ?::timestamptz as act, ?::timestamptz as wra, ?::timestamptz as exp)"
                . " select " . $independentUsed . ',' . $independentActual
                . " from usage_ledger, b"
                . " where user_id = ? and billing_plan = 'coding' and ledger_type = 'charge' and request_delta < 0"
                . " and user_plan_id = ?::uuid",
                [$act, $wra, $exp, $userId, $plan['bindingId']]
            )[0];
            $monthUsed   = 0;
            $monthActual = 0;
        } else {
            // 周期套餐：月(周期窗口) + 周/5h/总(独立窗口)
            $row = Db::connect('pgsql')->query(
                "with params as ("
                . " select ?::timestamptz as activated_at, ?::timestamptz as expires_at,"
                . " greatest(coalesce(?::int, 31), 1) as cycle_days"
                . "), win as ("
                . " select *, (date_trunc('day', (activated_at at time zone 'Asia/Shanghai')"
                . " + make_interval(days => cycle_days)) + interval '1 day' - interval '1 second') at time zone 'Asia/Shanghai' as first_window_end"
                . " from params"
                . "), widx as ("
                . " select *, case when now() <= first_window_end then 0"
                . " else floor(extract(epoch from (now() - (first_window_end + interval '1 second'))) / (cycle_days * 86400))::int + 1 end as cycles_after_first"
                . " from win"
                . "), mwin as ("
                . " select"
                . " case when cycles_after_first = 0 then activated_at"
                . " else first_window_end + make_interval(days => (cycles_after_first - 1) * cycle_days) + interval '1 second' end as cycle_window_start,"
                . " case when expires_at is not null and expires_at < (first_window_end + make_interval(days => cycles_after_first * cycle_days))"
                . " then expires_at else first_window_end + make_interval(days => cycles_after_first * cycle_days) end as cycle_window_end"
                . " from widx"
                . "), b as (select ?::timestamptz as act, ?::timestamptz as wra, ?::timestamptz as exp)"
                . " select"
                . " coalesce(sum(case when created_at >= cycle_window_start and created_at <= cycle_window_end then -request_delta else 0 end), 0) as cycle_used,"
                . " count(distinct case when created_at >= cycle_window_start and created_at <= cycle_window_end then request_log_id end) as cycle_actual,"
                . " min(mwin.cycle_window_end)::text as cycle_reset,"
                . $independentUsed . ',' . $independentActual
                . " from usage_ledger, mwin, b"
                . " where user_id = ? and billing_plan = 'coding' and ledger_type = 'charge' and request_delta < 0"
                . " and user_plan_id = ?::uuid",
                [$act, $exp, $cycleDays, $act, $wra, $exp, $userId, $plan['bindingId']]
            )[0];
            $monthUsed   = (float) ($row['cycle_used'] ?? 0);
            $monthActual = (int) ($row['cycle_actual'] ?? 0);
        }

        // 5h 滚动窗「下次恢复」时刻：窗内最早一笔用量滚出窗口的时间（无用量则 null）
        $h5ResetRaw = Db::connect('pgsql')->query(
            "select (min(created_at) + interval '5 hours')::text as h5_reset"
            . " from usage_ledger"
            . " where user_id = ? and billing_plan = 'coding' and ledger_type = 'charge' and request_delta < 0"
            . " and user_plan_id = ?::uuid"
            . " and created_at >= greatest(now() - interval '5 hours', ?::timestamptz, coalesce(?::timestamptz, '-infinity'::timestamptz))"
            . " and (?::timestamptz is null or created_at <= ?::timestamptz)",
            [$userId, $plan['bindingId'], $act, $wra, $exp, $exp]
        )[0]['h5_reset'] ?? null;
        $h5Reset = $h5ResetRaw !== null ? (new \DateTimeImmutable($h5ResetRaw))->format(\DateTimeInterface::ATOM) : null;
        // 周（自然周，沪时区）重置时刻 = 下周一 00:00
        $nowCst    = new \DateTimeImmutable('now', new \DateTimeZone('Asia/Shanghai'));
        $dow       = (int) $nowCst->format('N'); // 1=周一 … 7=周日
        $weekReset = $nowCst->setTime(0, 0, 0)->modify('-' . ($dow - 1) . ' days')->modify('+7 days')->format(\DateTimeInterface::ATOM);
        $cycleReset = isset($row['cycle_reset']) && $row['cycle_reset'] !== null
            ? (new \DateTimeImmutable($row['cycle_reset']))->format(\DateTimeInterface::ATOM) : null;

        $label     = $this->cycleLabel($cycleDays);
        $h5Used    = max(0, (float) ($row['h5_used'] ?? 0));
        $weekUsed  = max(0, (float) ($row['week_used'] ?? 0));
        $totalUsed = max(0, (float) ($row['total_used'] ?? 0));
        $h5Actual    = (int) ($row['h5_actual'] ?? 0);
        $weekActual  = (int) ($row['week_actual'] ?? 0);
        $totalActual = (int) ($row['total_actual'] ?? 0);

        $windows = [];
        if ($totalLimit !== null && $totalLimit > 0) {
            $windows[] = ['key' => 'total', 'label' => '总量', 'limit' => $totalLimit, 'used' => $totalUsed, 'usedRequests' => $totalActual, 'resetAt' => null];
        }
        if (!$isPermanent && $cycleLimit !== null && $cycleLimit > 0) {
            $windows[] = ['key' => 'month', 'label' => $label, 'limit' => $cycleLimit, 'used' => max(0, $monthUsed), 'usedRequests' => $monthActual, 'resetAt' => $cycleReset];
        }
        if ($weekLimit > 0) {
            $windows[] = ['key' => 'week', 'label' => '本周', 'limit' => $weekLimit, 'used' => $weekUsed, 'usedRequests' => $weekActual, 'resetAt' => $weekReset];
        }
        if ($h5Limit > 0) {
            $windows[] = ['key' => 'h5', 'label' => '近 5 小时', 'limit' => $h5Limit, 'used' => $h5Used, 'usedRequests' => $h5Actual, 'resetAt' => $h5Reset];
        }
        if (!$windows) {
            // 全不限套餐：回退展示当前周期已用，避免整块空白
            $windows[] = ['key' => 'month', 'label' => $isPermanent ? '总量' : $label, 'limit' => null, 'used' => max(0, $isPermanent ? $totalUsed : $monthUsed), 'usedRequests' => $isPermanent ? $totalActual : $monthActual];
        }

        return [
            'billingPlan'  => 'coding',
            'planName'     => $plan['name'],
            'unit'         => 'requests',
            'mode'         => 'window',
            'billingModel' => $billingModel,
            'total'        => null, // 不再单独渲染「总额」行，由各窗口自行展示已用/剩余
            'windows'      => $windows,
            'reserved'     => $reserved,
        ];
    }

    /** 周期长度（default_duration_days，空按月）→ 展示标签（与 billingModel 阈值对齐） */
    private function cycleLabel(?int $cycleDays): string
    {
        $d = $cycleDays ?? 31;
        if ($d >= 3650) return '总量';   // ≥10 年：视为永不刷新的总量桶
        if ($d <= 1) return '本日';
        if ($d <= 31) return '本月';
        if ($d <= 92) return '本季';
        return '本年';
    }

    /**
     * 由周期长度与「是否有上限」派生计费模式（展示用，与执行器字段语义对齐）。
     *
     *  - metered   按量计费：5h/周/周期限额均为空 → 执行器视作不限（2147483647）
     *  - permanent 永久：周期 ≥ 3650 天（≈10 年）→ 执行器按超长周期计，≈ 永不刷新的总量桶
     *  - daily/monthly/quarterly/yearly：按 default_duration_days 换算的周期套餐
     */
    private function billingModel(?int $cycleDays, bool $hasCap): string
    {
        if (!$hasCap) return 'metered';
        $d = $cycleDays ?? 31;
        if ($d >= 3650) return 'permanent';
        if ($d <= 1) return 'daily';
        if ($d <= 31) return 'monthly';
        if ($d <= 92) return 'quarterly';
        return 'yearly';
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
