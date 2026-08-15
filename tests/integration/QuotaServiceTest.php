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
        $plan = $this->seedPlan(['plan_type' => 'coding', 'cycle_limit' => 1000]);
        $binding = $this->seedUserPlan($user, $plan, ['plan_type' => 'coding', 'activated_at' => date('Y-m-d H:i:s', strtotime('-10 days'))]);
        // coding 扣费按绑定隔离（对齐执行器 per-plan 容量），seed 需带 user_plan_id
        $this->seedLedger($user, ['ledger_type' => 'charge', 'billing_plan' => 'coding', 'request_delta' => -100, 'user_plan_id' => $binding]);
        $this->seedLedger($user, ['ledger_type' => 'charge', 'billing_plan' => 'coding', 'request_delta' => -40, 'user_plan_id' => $binding]);

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
        $this->assertSame(140.0, $monthWin['used']);
    }

    public function testCodingWindowUsedRequestsCountsDistinctLogs(): void
    {
        // 倍率场景:3 个真实请求(glm×5 类)各扣 5 次 → used=15,usedRequests=3
        $user = $this->uuid();
        $plan = $this->seedPlan(['plan_type' => 'coding', 'cycle_limit' => 500]);
        $binding = $this->seedUserPlan($user, $plan, ['plan_type' => 'coding', 'activated_at' => date('Y-m-d H:i:s', strtotime('-10 days'))]);
        foreach ([1, 2, 3] as $i) {
            $this->seedLedger($user, [
                'ledger_type' => 'charge', 'billing_plan' => 'coding',
                'request_delta' => -5, 'user_plan_id' => $binding,
                'request_log_id' => $this->seedRequestLog($user),
            ]);
        }
        // 老数据(无 request_log_id):只计扣费次数,不计实际次数
        $this->seedLedger($user, ['ledger_type' => 'charge', 'billing_plan' => 'coding', 'request_delta' => -2, 'user_plan_id' => $binding]);

        $item = $this->findItem($this->service->summary($user), 'coding');
        $monthWin = null;
        foreach ($item['windows'] as $w) {
            if ($w['key'] === 'month') {
                $monthWin = $w;
            }
        }
        $this->assertNotNull($monthWin);
        $this->assertSame(17.0, $monthWin['used']);          // 3×5 + 2(扣费口径,与执行器一致)
        $this->assertSame(3, $monthWin['usedRequests']);     // 实际 3 个请求
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
        $this->assertSame(-25.0, $byPlan['coding']['requestBalance']);
    }

    public function testMultipleCodingPlansEachGetOwnCard(): void
    {
        $user = $this->uuid();
        $big = $this->seedPlan(['plan_type' => 'coding', 'name' => '旗舰版', 'cycle_limit' => 500, 'cycle_days' => 1]);
        $small = $this->seedPlan(['plan_type' => 'coding', 'name' => '尝鲜版', 'cycle_limit' => 100, 'cycle_days' => 1]);
        $bigB = $this->seedUserPlan($user, $big, ['plan_type' => 'coding', 'activated_at' => date('Y-m-d H:i:s', strtotime('-2 days'))]);
        $smallB = $this->seedUserPlan($user, $small, ['plan_type' => 'coding', 'activated_at' => date('Y-m-d H:i:s', strtotime('-1 days'))]);
        // 各扣各的：旗舰 30、尝鲜 20
        $this->seedLedger($user, ['ledger_type' => 'charge', 'billing_plan' => 'coding', 'request_delta' => -30, 'user_plan_id' => $bigB]);
        $this->seedLedger($user, ['ledger_type' => 'charge', 'billing_plan' => 'coding', 'request_delta' => -20, 'user_plan_id' => $smallB]);

        $items = $this->service->summary($user);
        $codingItems = array_values(array_filter($items, fn ($i) => $i['billingPlan'] === 'coding'));

        $this->assertCount(2, $codingItems, '两个 active coding 套餐应各出一张卡');
        // 排序=默认扣费策略（限额小优先）：cycle_limit 低的在前
        $this->assertSame('尝鲜版', $codingItems[0]['planName']);
        $this->assertSame('旗舰版', $codingItems[1]['planName']);
        // 各卡的周期窗用量按绑定隔离（顺序翻转后：尝鲜版 20、旗舰版 30）
        $this->assertSame(20.0, $codingItems[0]['windows'][0]['used']);
        $this->assertSame(30.0, $codingItems[1]['windows'][0]['used']);
    }
}
