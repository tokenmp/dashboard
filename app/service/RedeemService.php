<?php
declare(strict_types=1);

namespace app\service;

use think\facade\Db;

/**
 * 兑换码兑换核心逻辑。
 *
 * 在单事务内原子完成一次兑换，校验口径对齐 Go 执行器（internal/postgres/redeem_code.go）：
 *  1. 码状态：active / 已到生效时间 / 未过期 / 未兑完 / 该用户未重复兑换
 *  2. 奖励套餐仍为 active（创建后被下架的套餐兑换失败）
 *  3. coding 奖励不降级（比用户当前生效 coding 套餐更差则拒绝整个兑换）
 *  4. 发放 token 余额（recharge 流水）+ 套餐奖励（grant / replace / renew），写流水
 *  5. 落 redeem_code_redemptions（含码明文快照）+ redeemed_count + 1
 *
 * 套餐发放规则（对齐执行器）：
 *  - coding：按 monthly/weekly/hourly/price 比较 → new(新建) / upgrade(替换) / renew(续期) / downgrade(拒绝)
 *  - token：override_mode=replace 停旧建新；upgrade_only 仅当无现有时新建
 *  - image：永远 replace（停旧建新）
 */
class RedeemService
{
    private const PLAN_TYPES = ['coding', 'token', 'image'];

    /**
     * 执行兑换。
     *
     * @param string $userId 兑换人
     * @param string $code   兑换码明文（原始输入）
     * @return array{code:array,redemption:array}
     * @throws \think\exception\HttpException 校验失败时抛 4xx
     */
    public function redeem(string $userId, string $code): array
    {
        $code = trim($code);
        if ($code === '') {
            throw new \think\exception\HttpException(400, '兑换码不能为空');
        }

        $hash = hash('sha256', $code);

        return Db::connect('pgsql')->transaction(function () use ($userId, $code, $hash) {
            // 锁定码行，防止并发超额兑换
            $rows = Db::connect('pgsql')->query(
                "SELECT * FROM redeem_codes WHERE code_hash = ? AND status = 'active' FOR UPDATE",
                [$hash]
            );
            if (empty($rows)) {
                throw new \think\exception\HttpException(404, '兑换码无效或已被停用');
            }
            $row = $rows[0];

            $now = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));

            // 生效 / 过期 / 次数 / 重复 兑换校验
            if ($row['starts_at'] !== null) {
                $starts = new \DateTimeImmutable((string) $row['starts_at'], new \DateTimeZone('UTC'));
                if ($starts > $now) {
                    throw new \think\exception\HttpException(400, '兑换码尚未生效');
                }
            }
            if ($row['expires_at'] !== null) {
                $expires = new \DateTimeImmutable((string) $row['expires_at'], new \DateTimeZone('UTC'));
                if ($expires <= $now) {
                    throw new \think\exception\HttpException(400, '兑换码已过期');
                }
            }
            if ((int) $row['redeemed_count'] >= (int) $row['max_redemptions']) {
                throw new \think\exception\HttpException(400, '兑换码已被领完');
            }
            $dup = Db::connect('pgsql')->query(
                'SELECT id FROM redeem_code_redemptions WHERE redeem_code_id = ? AND user_id = ? LIMIT 1',
                [$row['id'], $userId]
            );
            if (!empty($dup)) {
                throw new \think\exception\HttpException(400, '你已兑换过此兑换码');
            }

            $codeId       = (string) $row['id'];
            $tokenAmount  = (int) $row['token_amount'];
            $overrideMode = (string) $row['override_mode'];
            $durationDays = $row['duration_days'] !== null ? (int) $row['duration_days'] : null;

            // 奖励配置
            $planRewards = [];
            foreach (self::PLAN_TYPES as $type) {
                $pid = $row["{$type}_plan_id"] ?? null;
                if ($pid !== null) {
                    $planRewards[$type] = (string) $pid;
                }
            }

            // ── 奖励套餐须仍为 active（创建后被下架则拒绝）──
            $this->assertRewardPlansActive($planRewards);

            $ledgerId    = null;
            $userPlanIds = ['coding' => null, 'token' => null, 'image' => null];

            // ── token 余额充值 ──
            if ($tokenAmount > 0) {
                $ledgerId = $this->genUuid();
                Db::connect('pgsql')->execute(
                    "INSERT INTO usage_ledger (id, user_id, ledger_type, billing_plan, token_delta, request_delta, reason)
                     VALUES (?, ?, 'recharge', 'token', ?, 0, ?)",
                    [$ledgerId, $userId, $tokenAmount, '兑换码 ' . $code . ' 充值']
                );
            }

            // ── 套餐奖励发放（按类型分别处理，对齐执行器）──
            foreach ($planRewards as $type => $planId) {
                $ledgerType = $this->grantPlan($userId, $type, $planId, $overrideMode, $durationDays, $userPlanIds);
                if ($ledgerType === null) {
                    continue; // upgrade_only 且已有同类 → 跳过
                }
                $planLedger = $this->genUuid();
                Db::connect('pgsql')->execute(
                    "INSERT INTO usage_ledger (id, user_id, ledger_type, billing_plan, token_delta, request_delta, reason)
                     VALUES (?, ?, ?, ?, 0, 0, ?)",
                    [$planLedger, $userId, $ledgerType, $type, '兑换码 ' . $code . ' 赠送套餐']
                );
                if ($ledgerId === null) {
                    $ledgerId = $planLedger;
                }
            }

            // ── 落兑换记录（含码明文快照）──
            $redemptionId = $this->genUuid();
            Db::connect('pgsql')->execute(
                "INSERT INTO redeem_code_redemptions
                    (id, redeem_code_id, user_id, token_amount, ledger_id,
                     coding_plan_id, token_plan_id, image_plan_id,
                     coding_user_plan_id, token_user_plan_id, image_user_plan_id, code)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    $redemptionId, $codeId, $userId, $tokenAmount, $ledgerId,
                    $planRewards['coding'] ?? null, $planRewards['token'] ?? null, $planRewards['image'] ?? null,
                    $userPlanIds['coding'], $userPlanIds['token'], $userPlanIds['image'],
                    $code,
                ]
            );

            // ── 计数 +1 ──
            Db::connect('pgsql')->execute(
                'UPDATE redeem_codes SET redeemed_count = redeemed_count + 1 WHERE id = ?',
                [$codeId]
            );

            return [
                'code' => [
                    'id'     => $codeId,
                    'name'   => (string) $row['name'],
                    'prefix' => $row['code_prefix'] !== null ? (string) $row['code_prefix'] : null,
                    'suffix' => $row['code_suffix'] !== null ? (string) $row['code_suffix'] : null,
                ],
                'redemption' => [
                    'id'                  => $redemptionId,
                    'redeem_code_id'      => $codeId,
                    'user_id'             => $userId,
                    'token_amount'        => $tokenAmount,
                    'ledger_id'           => $ledgerId,
                    'coding_plan_id'      => $planRewards['coding'] ?? null,
                    'token_plan_id'       => $planRewards['token'] ?? null,
                    'image_plan_id'       => $planRewards['image'] ?? null,
                    'coding_user_plan_id' => $userPlanIds['coding'],
                    'token_user_plan_id'  => $userPlanIds['token'],
                    'image_user_plan_id'  => $userPlanIds['image'],
                    'code'                => $code,
                ],
            ];
        });
    }

    /* ============================== 套餐发放 ============================== */

    /** 奖励套餐须仍为 active（创建后被下架则拒绝兑换）。 */
    private function assertRewardPlansActive(array $planRewards): void
    {
        foreach ($planRewards as $type => $planId) {
            $plan = Db::connect('pgsql')->query(
                "SELECT id FROM plans WHERE id = ? AND plan_type = ? AND status = 'active'",
                [$planId, $type]
            );
            if (empty($plan)) {
                throw new \think\exception\HttpException(400, "奖励套餐已下架，无法兑换");
            }
        }
    }

    /**
     * 按类型发放套餐，写入 user_plans，返回流水类型（plan_grant/plan_replace/plan_renew/plan_upgrade）；
     * upgrade_only 且已有同类 active 时返回 null（跳过）。
     *
     * @param array<string,?string> $userPlanIds 本次生效的 user_plan 行（按引用回填）
     */
    private function grantPlan(string $userId, string $type, string $planId, string $overrideMode, ?int $durationDays, array &$userPlanIds): ?string
    {
        if ($type === 'coding') {
            return $this->grantCodingPlan($userId, $planId, $durationDays, $userPlanIds);
        }
        // token / image
        return $this->grantTierPlan($userId, $type, $planId, $overrideMode, $durationDays, $userPlanIds);
    }

    /**
     * coding 套餐：按 monthly/weekly/hourly/price 比较当前生效套餐。
     * - new：无现有 → 新建
     * - upgrade：奖励更高 → 停旧建新
     * - renew：同档 → 在当前到期时间上续期（duration_days 天）
     * - downgrade：奖励更低 → 拒绝整个兑换（抛异常）
     */
    private function grantCodingPlan(string $userId, string $planId, ?int $durationDays, array &$userPlanIds): string
    {
        $reward = Db::connect('pgsql')->query(
            "SELECT id, default_duration_days FROM plans WHERE id = ? AND plan_type = 'coding' AND status = 'active'",
            [$planId]
        )[0] ?? null;

        $current = Db::connect('pgsql')->query(
            "SELECT up.id AS user_plan_id, up.expires_at, up.activated_at,
                    COALESCE(p.monthly_limit,0) AS monthly_limit,
                    COALESCE(p.weekly_limit,0) AS weekly_limit,
                    COALESCE(p.hourly_5h_limit,0) AS hourly_5h_limit,
                    COALESCE(p.price,0) AS price
             FROM user_plans up JOIN plans p ON p.id = up.plan_id
             WHERE up.user_id = ? AND up.plan_type = 'coding' AND up.status = 'active'
               AND p.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > now())
             ORDER BY COALESCE(p.monthly_limit,0) DESC, COALESCE(p.weekly_limit,0) DESC,
                      COALESCE(p.hourly_5h_limit,0) DESC, COALESCE(p.price,0) DESC, up.activated_at DESC
             LIMIT 1",
            [$userId]
        );
        $current = !empty($current) ? $current[0] : null;

        $rewardRank = $this->codingRank($reward ? $reward : []);
        $action = 'new';
        if ($current !== null) {
            $currentRank = $this->codingRank([
                'monthly_limit'    => $current['monthly_limit'],
                'weekly_limit'     => $current['weekly_limit'],
                'hourly_5h_limit'  => $current['hourly_5h_limit'],
                'price'            => $current['price'],
            ]);
            if ($rewardRank > $currentRank) {
                $action = 'upgrade';
            } elseif ($rewardRank === $currentRank) {
                $action = 'renew';
            } else {
                throw new \think\exception\HttpException(400, '奖励的编程套餐低于你当前套餐，无法兑换');
            }
        }

        $days = $durationDays ?? ($reward['default_duration_days'] ?? null);
        $baseExpiry = ($action === 'renew' && $current['expires_at'] !== null && strtotime((string) $current['expires_at']) > time())
            ? (string) $current['expires_at']
            : null;
        $expiresAt = $this->computeExpiry($days, $baseExpiry);

        if ($action === 'renew') {
            // 续期：更新现有 user_plan 的过期时间
            Db::connect('pgsql')->execute(
                'UPDATE user_plans SET expires_at = ? WHERE id = ?',
                [$expiresAt, $current['user_plan_id']]
            );
            $userPlanIds['coding'] = $current['user_plan_id'];
            return 'plan_renew';
        }

        // new / upgrade：停用现有（如有），新建
        if ($current !== null) {
            Db::connect('pgsql')->execute(
                "UPDATE user_plans SET status = 'disabled' WHERE id = ?",
                [$current['user_plan_id']]
            );
        }
        $newUp = $this->genUuid();
        Db::connect('pgsql')->execute(
            'INSERT INTO user_plans (id, user_id, plan_id, plan_type, status, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
            [$newUp, $userId, $planId, 'coding', 'active', $expiresAt]
        );
        $userPlanIds['coding'] = $newUp;
        return $current !== null ? 'plan_upgrade' : 'plan_grant';
    }

    /** coding 套餐等级排序权重（monthly>weekly>hourly>price，高的更强）。 */
    private function codingRank(array $p): string
    {
        return sprintf('%020d_%020d_%020d_%020d',
            (int) ($p['monthly_limit'] ?? 0),
            (int) ($p['weekly_limit'] ?? 0),
            (int) ($p['hourly_5h_limit'] ?? 0),
            (int) ($p['price'] ?? 0)
        );
    }

    /**
     * token / image 套餐：
     * - replace（默认）：停旧建新
     * - upgrade_only（仅 token）：仅当无现有 active 时新建
     * - image 永远 replace（无视 override_mode）
     */
    private function grantTierPlan(string $userId, string $type, string $planId, string $overrideMode, ?int $durationDays, array &$userPlanIds): ?string
    {
        $existing = Db::connect('pgsql')->query(
            "SELECT id FROM user_plans
             WHERE user_id = ? AND plan_type = ? AND status = 'active'
               AND (expires_at IS NULL OR expires_at > now())
             LIMIT 1",
            [$userId, $type]
        );

        $mode = $type === 'image' ? 'replace' : $overrideMode;

        if (!empty($existing)) {
            if ($mode === 'upgrade_only') {
                return null; // 已有同类，升级模式不替换
            }
            Db::connect('pgsql')->execute(
                "UPDATE user_plans SET status = 'disabled' WHERE id = ?",
                [$existing[0]['id']]
            );
        }

        $days = $durationDays ?? ($this->planDefaultDays($planId));
        $expiresAt = $this->computeExpiry($days, null);
        $newUp = $this->genUuid();
        Db::connect('pgsql')->execute(
            'INSERT INTO user_plans (id, user_id, plan_id, plan_type, status, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
            [$newUp, $userId, $planId, $type, 'active', $expiresAt]
        );
        $userPlanIds[$type] = $newUp;
        return (!empty($existing) && $mode === 'replace') ? 'plan_replace' : 'plan_grant';
    }

    private function planDefaultDays(string $planId): ?int
    {
        $p = Db::connect('pgsql')->query(
            'SELECT default_duration_days FROM plans WHERE id = ?',
            [$planId]
        );
        return !empty($p) && $p[0]['default_duration_days'] !== null ? (int) $p[0]['default_duration_days'] : null;
    }

    /**
     * 计算套餐过期时间。$baseExpiry 非空时从该基点续期（用于 coding renew），否则从 now 起。
     * 沿用执行器：按上海时区加整天，落到当天 23:59:59。
     */
    private function computeExpiry(?int $durationDays, ?string $baseExpiry): ?string
    {
        if ($durationDays === null) {
            return null; // 永久
        }
        $base = $baseExpiry !== null
            ? new \DateTimeImmutable($baseExpiry, new \DateTimeZone('Asia/Shanghai'))
            : new \DateTimeImmutable('now', new \DateTimeZone('Asia/Shanghai'));
        return $base
            ->modify("+{$durationDays} days")
            ->setTime(23, 59, 59)
            ->setTimezone(new \DateTimeZone('UTC'))
            ->format('Y-m-d H:i:s');
    }

    private function genUuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
