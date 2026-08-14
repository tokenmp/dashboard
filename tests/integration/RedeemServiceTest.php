<?php
declare(strict_types=1);

namespace tests\integration;

use app\service\RedeemService;
use think\exception\HttpException;

/**
 * RedeemService 集成测试。
 *
 * 在真实 PG + 事务上验证兑换全流程:状态/时效/次数/重复 校验,token 充值,
 * coding 套餐 new/upgrade/renew/downgrade,token/image replace。
 * 校验口径对齐 Go 执行器 internal/postgres/redeem_code.go。
 */
final class RedeemServiceTest extends IntegrationTestCase
{
    private RedeemService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new RedeemService();
    }

    /** 断言 redeem 抛出指定 HTTP 状态码;不抛则 fail。 */
    private function redeemExpect(int $code, string $userId, string $codeStr): void
    {
        try {
            $this->service->redeem($userId, $codeStr);
            $this->fail("期望抛出 HttpException($code),实际未抛出");
        } catch (HttpException $e) {
            $this->assertSame($code, $e->getStatusCode(), "期望 HTTP {$code},得到 {$e->getStatusCode()}: {$e->getMessage()}");
        }
    }

    /* ----------------------------- 校验失败分支 ----------------------------- */

    public function testEmptyCodeRejected(): void
    {
        $this->redeemExpect(400, $this->uuid(), '   ');
    }

    public function testUnknownCodeRejected(): void
    {
        $this->redeemExpect(404, $this->uuid(), 'NO-SUCH-CODE-' . bin2hex(random_bytes(4)));
    }

    public function testNotYetActiveRejected(): void
    {
        $code = 'FUTURE-' . bin2hex(random_bytes(3));
        // token_amount 满足 reward_presence_check;校验在校验阶段抛,不到 INSERT
        $this->seedRedeemCode($code, ['token_amount' => 100, 'starts_at' => date('Y-m-d H:i:s', strtotime('+1 day'))]);
        $this->redeemExpect(400, $this->uuid(), $code);
    }

    public function testExpiredRejected(): void
    {
        $code = 'OLD-' . bin2hex(random_bytes(3));
        $this->seedRedeemCode($code, ['token_amount' => 100, 'expires_at' => date('Y-m-d H:i:s', strtotime('-1 day'))]);
        $this->redeemExpect(400, $this->uuid(), $code);
    }

    public function testFullyRedeemedRejected(): void
    {
        $code = 'GONE-' . bin2hex(random_bytes(3));
        $this->seedRedeemCode($code, ['token_amount' => 100, 'max_redemptions' => 1, 'redeemed_count' => 1]);
        $this->redeemExpect(400, $this->uuid(), $code);
    }

    public function testDuplicateRedemptionRejected(): void
    {
        $user = $this->uuid();
        $code = 'DUP-' . bin2hex(random_bytes(3));
        $this->seedRedeemCode($code, ['token_amount' => 100]);

        // 首次成功(recharge 会写 usage_ledger,需要 user 存在)
        $this->seedUser($user);
        $r = $this->service->redeem($user, $code);
        $this->assertSame($code, $r['redemption']['code']);

        // 同一用户再次兑换 → 400
        $this->redeemExpect(400, $user, $code);
    }

    public function testInactiveRewardPlanRejected(): void
    {
        $user  = $this->uuid();
        $code  = 'INACTIVE-' . bin2hex(random_bytes(3));
        $plan  = $this->seedPlan(['plan_type' => 'coding', 'cycle_limit' => 1000, 'status' => 'disabled']);
        $this->seedRedeemCode($code, ['coding_plan_id' => $plan]);
        $this->redeemExpect(400, $user, $code);
    }

    /* ----------------------------- 成功发放 ----------------------------- */

    public function testHappyPathGrantsTokenRechargeAndCodingPlan(): void
    {
        $user = $this->uuid();
        $code = 'HAPPY-' . bin2hex(random_bytes(3));
        $plan = $this->seedPlan(['plan_type' => 'coding', 'cycle_limit' => 1000]);
        $this->seedRedeemCode($code, ['token_amount' => 500, 'coding_plan_id' => $plan, 'duration_days' => 30]);
        $this->seedUser($user);

        $result = $this->service->redeem($user, $code);

        // 返回结构
        $this->assertSame($plan, $result['redemption']['coding_plan_id']);
        $this->assertSame(500, $result['redemption']['token_amount']);
        $this->assertSame($code, $result['redemption']['code']);

        // token 充值流水
        $recharge = $this->rows(
            "SELECT token_delta FROM usage_ledger WHERE user_id = ? AND ledger_type = 'recharge' AND billing_plan = 'token'",
            [$user]
        );
        $this->assertCount(1, $recharge);
        $this->assertSame(500, (int) $recharge[0]['token_delta']);

        // coding 套餐发放流水(new → plan_grant)
        $grant = $this->rows(
            "SELECT ledger_type FROM usage_ledger WHERE user_id = ? AND billing_plan = 'coding'",
            [$user]
        );
        $this->assertCount(1, $grant);
        $this->assertSame('plan_grant', $grant[0]['ledger_type']);

        // user_plans:有一条 active 的 coding 套餐,指向奖励 plan
        $up = $this->rows(
            "SELECT plan_id, status FROM user_plans WHERE user_id = ? AND plan_type = 'coding'",
            [$user]
        );
        $this->assertCount(1, $up);
        $this->assertSame($plan, $up[0]['plan_id']);
        $this->assertSame('active', $up[0]['status']);

        // 兑换记录 + 计数 +1
        $red = $this->rows("SELECT code, token_amount FROM redeem_code_redemptions WHERE user_id = ?", [$user]);
        $this->assertCount(1, $red);
        $this->assertSame($code, $red[0]['code']);

        $cnt = $this->rows("SELECT redeemed_count FROM redeem_codes WHERE code_hash = ?", [hash('sha256', $code)]);
        $this->assertSame(1, (int) $cnt[0]['redeemed_count']);
    }

    /* ----------------------------- coding 套餐升级/续期/降级 ----------------------------- */

    public function testCodingDowngradeRejected(): void
    {
        $user    = $this->uuid();
        $strong   = $this->seedPlan(['plan_type' => 'coding', 'cycle_limit' => 1000]);
        $weak     = $this->seedPlan(['plan_type' => 'coding', 'cycle_limit' => 500]);
        // 用户当前持有更强套餐
        $this->seedUserPlan($user, $strong, ['plan_type' => 'coding', 'expires_at' => date('Y-m-d H:i:s', strtotime('+5 days'))]);

        $code = 'DOWN-' . bin2hex(random_bytes(3));
        $this->seedRedeemCode($code, ['coding_plan_id' => $weak, 'duration_days' => 30]);

        $this->redeemExpect(400, $user, $code); // 奖励更低 → 拒绝整个兑换

        // 且未产生任何副作用(事务回滚)
        $this->assertCount(0, $this->rows("SELECT id FROM redeem_code_redemptions WHERE user_id = ?", [$user]));
    }

    public function testCodingRenewExtendsSameRankPlanExpiry(): void
    {
        $user  = $this->uuid();
        $plan   = $this->seedPlan(['plan_type' => 'coding', 'cycle_limit' => 1000]);
        $existingExpiry = date('Y-m-d H:i:s', strtotime('+5 days'));
        $upId  = $this->seedUserPlan($user, $plan, ['plan_type' => 'coding', 'expires_at' => $existingExpiry]);

        $code = 'RENEW-' . bin2hex(random_bytes(3));
        $this->seedRedeemCode($code, ['coding_plan_id' => $plan, 'duration_days' => 30]);

        $result = $this->service->redeem($user, $code);
        $this->assertSame('plan_renew', $result['redemption']['coding_plan_id'] ? 'plan_renew' : '');

        // 续期:仍是同一条 user_plan,active,且过期时间被延后(原 +5d → 约 +35d)
        $rows = $this->rows("SELECT id, status, expires_at FROM user_plans WHERE user_id = ? AND plan_type = 'coding'", [$user]);
        $this->assertCount(1, $rows);
        $this->assertSame($upId, $rows[0]['id']);
        $this->assertSame('active', $rows[0]['status']);
        $this->assertGreaterThan(strtotime($existingExpiry) + 29 * 86400, strtotime((string) $rows[0]['expires_at']));
    }

    public function testCodingUpgradeReplacesLowerRankPlan(): void
    {
        $user  = $this->uuid();
        $weak   = $this->seedPlan(['plan_type' => 'coding', 'cycle_limit' => 500]);
        $strong = $this->seedPlan(['plan_type' => 'coding', 'cycle_limit' => 1000]);
        $this->seedUserPlan($user, $weak, ['plan_type' => 'coding', 'expires_at' => date('Y-m-d H:i:s', strtotime('+5 days'))]);

        $code = 'UP-' . bin2hex(random_bytes(3));
        $this->seedRedeemCode($code, ['coding_plan_id' => $strong, 'duration_days' => 30]);

        $result = $this->service->redeem($user, $code);

        // 升级:旧 disabled,新 active(两条 user_plan)
        $rows = $this->rows(
            "SELECT plan_id, status FROM user_plans WHERE user_id = ? AND plan_type = 'coding' ORDER BY status",
            [$user]
        );
        $this->assertCount(2, $rows);
        // grantCodingPlan:rewardRank > currentRank → plan_upgrade 流水
        $grant = $this->rows("SELECT ledger_type FROM usage_ledger WHERE user_id = ? AND billing_plan = 'coding'", [$user]);
        $this->assertSame('plan_upgrade', $grant[0]['ledger_type']);
        // 返回的 coding_user_plan_id 指向新建的 active 行
        $this->assertNotNull($result['redemption']['coding_user_plan_id']);
    }

    /* ----------------------------- token / image replace ----------------------------- */

    public function testTokenOverrideReplaceDisablesExisting(): void
    {
        $user   = $this->uuid();
        $old     = $this->seedPlan(['plan_type' => 'token', 'token_limit' => 100]);
        $new     = $this->seedPlan(['plan_type' => 'token', 'token_limit' => 200]);
        $this->seedUserPlan($user, $old, ['plan_type' => 'token']);

        $code = 'TOKREPL-' . bin2hex(random_bytes(3));
        $this->seedRedeemCode($code, ['token_plan_id' => $new, 'override_mode' => 'replace', 'duration_days' => 30]);

        $this->service->redeem($user, $code);

        $rows = $this->rows("SELECT plan_id, status FROM user_plans WHERE user_id = ? AND plan_type = 'token'", [$user]);
        $this->assertCount(2, $rows);
        $byPlan = [];
        foreach ($rows as $r) {
            $byPlan[$r['plan_id']] = $r['status'];
        }
        $this->assertSame('disabled', $byPlan[$old]);
        $this->assertSame('active', $byPlan[$new]);
    }

    public function testTokenUpgradeOnlySkipsWhenExisting(): void
    {
        $user   = $this->uuid();
        $old     = $this->seedPlan(['plan_type' => 'token', 'token_limit' => 100]);
        $new     = $this->seedPlan(['plan_type' => 'token', 'token_limit' => 200]);
        $this->seedUserPlan($user, $old, ['plan_type' => 'token']);

        $code = 'TOKUO-' . bin2hex(random_bytes(3));
        $this->seedRedeemCode($code, ['token_plan_id' => $new, 'override_mode' => 'upgrade_only']);

        $this->service->redeem($user, $code);

        // upgrade_only + 已有 → 不替换:旧仍 active,无新行
        $rows = $this->rows("SELECT plan_id, status FROM user_plans WHERE user_id = ? AND plan_type = 'token'", [$user]);
        $this->assertCount(1, $rows);
        $this->assertSame($old, $rows[0]['plan_id']);
        $this->assertSame('active', $rows[0]['status']);
    }

    public function testImageAlwaysReplace(): void
    {
        $user   = $this->uuid();
        $old     = $this->seedPlan(['plan_type' => 'image', 'token_limit' => 50]);
        $new     = $this->seedPlan(['plan_type' => 'image', 'token_limit' => 100]);
        $this->seedUserPlan($user, $old, ['plan_type' => 'image']);

        // 即使 override_mode=upgrade_only,image 也应 replace(无视 override_mode)
        $code = 'IMGREPL-' . bin2hex(random_bytes(3));
        $this->seedRedeemCode($code, ['image_plan_id' => $new, 'override_mode' => 'upgrade_only', 'duration_days' => 30]);

        $this->service->redeem($user, $code);

        $rows = $this->rows("SELECT plan_id, status FROM user_plans WHERE user_id = ? AND plan_type = 'image'", [$user]);
        $this->assertCount(2, $rows);
        $byPlan = [];
        foreach ($rows as $r) {
            $byPlan[$r['plan_id']] = $r['status'];
        }
        $this->assertSame('disabled', $byPlan[$old]);
        $this->assertSame('active', $byPlan[$new]);
    }
}
