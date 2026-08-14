<?php
declare(strict_types=1);

namespace tests\integration;

use app\service\QuotaService;

/**
 * QuotaService 集成测试。
 *
 * 在真实 PG + 全量 schema 上验证三种计费类型(coding/token/image)的额度口径,
 * 与执行器(internal/postgres/quota.go)对齐。验证点:summary() 与 legacyUsage()。
 */
final class QuotaServiceTest extends IntegrationTestCase
{
    private QuotaService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new QuotaService();
    }

    /* ----------------------------- 空 / 无数据 ----------------------------- */

    public function testSummaryEmptyForUserWithNoPlanOrLedger(): void
    {
        $this->assertSame([], $this->service->summary($this->uuid()));
    }

    /* ----------------------------- token: capped ----------------------------- */

    public function testTokenCappedModeWithRechargeAndUsed(): void
    {
        $user = $this->uuid();
        $plan = $this->seedPlan(['plan_type' => 'token', 'token_limit' => 1000]);
        $this->seedUserPlan($user, $plan, ['plan_type' => 'token']);
        $this->seedLedger($user, ['ledger_type' => 'recharge', 'billing_plan' => 'token', 'token_delta' => 500]);
        $this->seedLedger($user, ['ledger_type' => 'charge', 'billing_plan' => 'token', 'token_delta' => -300]);

        $item = $this->findItem($this->service->summary($user), 'token');

        $this->assertNotNull($item);
        $this->assertSame('capped', $item['mode']);
        $this->assertSame(1000, $item['limit']);      // 套餐固定额度
        $this->assertSame(300, $item['used']);         // 全量累计
        $this->assertSame(500, $item['recharged']);    // 充值
        $this->assertSame(1500, $item['total']);       // cap = plan + recharge
        $this->assertSame(1200, $item['available']);   // 1500 - 300 - 0
    }

    public function testTokenReservedDeductsFromAvailable(): void
    {
        $user = $this->uuid();
        $plan = $this->seedPlan(['plan_type' => 'token', 'token_limit' => 1000]);
        $this->seedUserPlan($user, $plan, ['plan_type' => 'token']);
        $this->seedLedger($user, ['ledger_type' => 'charge', 'billing_plan' => 'token', 'token_delta' => -200]);
        $this->seedReservation($user, ['billing_plan' => 'token', 'reserved_tokens' => 100]);

        $item = $this->findItem($this->service->summary($user), 'token');

        $this->assertNotNull($item);
        // available = (1000 + 0) - 200 - 100 = 700
        $this->assertSame(700, $item['available']);
        $this->assertSame(100, $item['reserved']);
    }

    public function testTokenBalanceModeWhenNoPlanLimitButHasLedger(): void
    {
        // 无 token 套餐,只有充值/消费流水 → 纯计量预付费(balance 模式)
        $user = $this->uuid();
        $this->seedLedger($user, ['ledger_type' => 'recharge', 'billing_plan' => 'token', 'token_delta' => 500]);
        $this->seedLedger($user, ['ledger_type' => 'charge', 'billing_plan' => 'token', 'token_delta' => -200]);

        $item = $this->findItem($this->service->summary($user), 'token');

        $this->assertNotNull($item);
        $this->assertSame('balance', $item['mode']);
        $this->assertSame(300, $item['balance']);  // max(0, 500 - 200)
        $this->assertSame(200, $item['used']);
        $this->assertSame(300, $item['available']);
    }

    /* ----------------------------- image: capped ----------------------------- */

    public function testImageCappedModeUsesActivationWindow(): void
    {
        $user = $this->uuid();
        $plan = $this->seedPlan(['plan_type' => 'image', 'token_limit' => 200]);
        // 激活窗口:近 30 天(基类默认),过期 null(永久)
        $this->seedUserPlan($user, $plan, ['plan_type' => 'image']);
        $this->seedLedger($user, ['ledger_type' => 'charge', 'billing_plan' => 'image', 'token_delta' => -50]);

        $item = $this->findItem($this->service->summary($user), 'image');

        $this->assertNotNull($item);
        $this->assertSame('capped', $item['mode']);
        $this->assertSame(200, $item['limit']);
        $this->assertSame(50, $item['used']);
        $this->assertSame(150, $item['available']); // 200 - 50 - 0
    }

    /* ----------------------------- coding: 窗口 ----------------------------- */

    public function testCodingMonthlyWindowAggregatesUsed(): void
    {
        $user = $this->uuid();
        $plan = $this->seedPlan(['plan_type' => 'coding', 'monthly_limit' => 1000]);
        $this->seedUserPlan($user, $plan, ['plan_type' => 'coding', 'activated_at' => date('Y-m-d H:i:s', strtotime('-10 days'))]);
        $this->seedLedger($user, ['ledger_type' => 'charge', 'billing_plan' => 'coding', 'request_delta' => -100]);
        $this->seedLedger($user, ['ledger_type' => 'charge', 'billing_plan' => 'coding', 'request_delta' => -40]);

        $item = $this->findItem($this->service->summary($user), 'coding');

        $this->assertNotNull($item);
        $this->assertSame('coding', $item['billingPlan']);
        $this->assertSame('window', $item['mode']);
        $this->assertSame('monthly', $item['billingModel']);

        // 应有「本月」窗口,已用 = 100 + 40
        $monthWin = null;
        foreach ($item['windows'] as $w) {
            if ($w['key'] === 'month') {
                $monthWin = $w;
            }
        }
        $this->assertNotNull($monthWin);
        $this->assertSame(1000, $monthWin['limit']);
        $this->assertSame(140, $monthWin['used']);
    }

    /* ----------------------------- legacyUsage ----------------------------- */

    public function testLegacyUsageFlattensByBillingPlan(): void
    {
        $user = $this->uuid();
        $this->seedLedger($user, ['ledger_type' => 'recharge', 'billing_plan' => 'token', 'token_delta' => 800]);
        $this->seedLedger($user, ['ledger_type' => 'charge', 'billing_plan' => 'token', 'token_delta' => -300]);
        $this->seedLedger($user, ['ledger_type' => 'charge', 'billing_plan' => 'coding', 'request_delta' => -25]);

        $rows = $this->service->legacyUsage($user);

        $byPlan = [];
        foreach ($rows as $r) {
            $byPlan[$r['billingPlan']] = $r;
        }
        $this->assertArrayHasKey('token', $byPlan);
        $this->assertSame(500, $byPlan['token']['tokenBalance']); // 800 - 300
        $this->assertSame(0, $byPlan['token']['requestBalance']);

        // coding 不展示余额,只展示已用请求(取负)
        $this->assertArrayHasKey('coding', $byPlan);
        $this->assertSame(0, $byPlan['coding']['tokenBalance']);
        $this->assertSame(-25, $byPlan['coding']['requestBalance']);
    }
}
