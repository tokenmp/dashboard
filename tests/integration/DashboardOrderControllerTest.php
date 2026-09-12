<?php
declare(strict_types=1);

namespace tests\integration;

use app\controller\dashboard\Order as OrderController;
use think\exception\HttpException;

/**
 * 管理面订单控制器集成测试（orders / wallet_ledger 入账）。
 *
 * 覆盖手工建单（kind=topup，建单即入账 + 幂等）与充值单退款
 * （只退未消费部分、兑换码/套餐单不可退、重复退款拒绝）。
 */
final class DashboardOrderControllerTest extends IntegrationTestCase
{
    private function controller(): OrderController
    {
        return new OrderController(app());
    }

    /** 断言调用触发 400 HttpException */
    private function expect400(callable $call, string $needle = ''): void
    {
        $this->expectException(HttpException::class);
        try {
            $call();
        } catch (HttpException $e) {
            $this->assertSame(400, $e->getStatusCode());
            if ($needle !== '') {
                $this->assertStringContainsString($needle, $e->getMessage());
            }
            throw $e;
        }
    }

    private function orderRow(string $id): array
    {
        return $this->rows('SELECT * FROM orders WHERE id = ?::uuid', [$id])[0];
    }

    private function orderCount(): int
    {
        return (int) $this->rows('SELECT count(*) as c FROM orders')[0]['c'];
    }

    private function ledgerRows(string $userId): array
    {
        return $this->rows('SELECT entry_type, amount_cny, balance_after FROM wallet_ledger WHERE user_id = ? ORDER BY created_at', [$userId]);
    }

    /* ------------------------------ create ------------------------------ */

    public function testCreateRejectsNonPositiveAmount(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);

        $this->postRequest(['user_id' => $user, 'amount_cny' => 0]);
        $this->expect400(fn () => $this->controller()->create(), 'amount_cny 必须大于 0');
    }

    public function testCreateRejectsNonTopupKind(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);

        $this->postRequest(['user_id' => $user, 'amount_cny' => 100, 'kind' => 'plan']);
        $this->expect400(fn () => $this->controller()->create(), 'kind=topup');
        $this->assertSame(0, $this->orderCount());
    }

    public function testCreateRejectsUnknownUser(): void
    {
        $this->postRequest(['user_id' => $this->uuid(), 'amount_cny' => 100]);
        $this->expect400(fn () => $this->controller()->create(), '用户不存在');
    }

    public function testCreateSuccessCreditsWalletAndMarksPaid(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);
        $this->postRequest(['user_id' => $user, 'amount_cny' => 100]);

        $data = $this->body($this->controller()->create())['data'];

        $this->assertSame('paid', $data['status']);
        $this->assertSame('topup', $data['kind']);
        $this->assertSame(100.0, $data['amount_cny']);

        $row = $this->orderRow((string) $data['id']);
        $this->assertSame('paid', $row['status']);
        $this->assertNotNull($row['paid_at']);

        $this->assertSame(100.0, (float) $this->rows('SELECT balance_cny FROM wallets WHERE user_id = ?', [$user])[0]['balance_cny']);
        $ledger = $this->ledgerRows($user);
        $this->assertCount(1, $ledger);
        $this->assertSame('topup', $ledger[0]['entry_type']);
        $this->assertSame(100.0, (float) $ledger[0]['amount_cny']);
    }

    public function testCreateIdempotentReplayCreatesSingleOrderAndCredit(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);

        $this->postRequest(['user_id' => $user, 'amount_cny' => 100, 'idempotency_key' => 'order-key-1']);
        $first = $this->body($this->controller()->create())['data'];

        $this->postRequest(['user_id' => $user, 'amount_cny' => 100, 'idempotency_key' => 'order-key-1']);
        $second = $this->body($this->controller()->create())['data'];

        $this->assertSame((string) $first['id'], (string) $second['id']);
        $this->assertSame(1, $this->orderCount());
        $this->assertCount(1, $this->ledgerRows($user));
        $this->assertSame(100.0, (float) $this->rows('SELECT balance_cny FROM wallets WHERE user_id = ?', [$user])[0]['balance_cny']);
    }

    public function testCreateWithBonusWritesSeparateBonusLedgerRow(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);
        $this->postRequest(['user_id' => $user, 'amount_cny' => 100, 'bonus_cny' => 20]);

        $this->body($this->controller()->create());

        $byType = [];
        foreach ($this->ledgerRows($user) as $r) {
            $byType[$r['entry_type']] = (float) $r['amount_cny'];
        }
        ksort($byType);
        $this->assertSame(['bonus' => 20.0, 'topup' => 100.0], $byType);
        $this->assertSame(120.0, (float) $this->rows('SELECT balance_cny FROM wallets WHERE user_id = ?', [$user])[0]['balance_cny']);
    }

    /* ------------------------------ refund ------------------------------ */

    public function testRefundRejectsNonPaidOrder(): void
    {
        $user = $this->uuid();
        $id   = $this->seedOrder($user, ['status' => 'pending', 'amount_cny' => 50]);
        $this->postRequest([]);

        $this->expect400(fn () => $this->controller()->refund($id), '仅已支付订单可退款');
        $this->assertSame('pending', $this->orderRow($id)['status']);
    }

    public function testRefundRejectsAlreadyRefundedOrder(): void
    {
        $user = $this->uuid();
        $id   = $this->seedOrder($user, ['status' => 'refunded', 'amount_cny' => 50]);
        $this->postRequest([]);

        $this->expect400(fn () => $this->controller()->refund($id), '订单已退款');
    }

    public function testRefundRejectsRedeemMethod(): void
    {
        $user = $this->uuid();
        $id   = $this->seedOrder($user, ['method' => 'redeem', 'amount_cny' => 50]);
        $this->postRequest([]);

        $this->expect400(fn () => $this->controller()->refund($id), '兑换码订单不可退款');
        $this->assertSame('paid', $this->orderRow($id)['status']);
    }

    public function testRefundRejectsNonTopupKind(): void
    {
        $user = $this->uuid();
        $id   = $this->seedOrder($user, ['kind' => 'plan', 'amount_cny' => 50]);
        $this->postRequest([]);

        $this->expect400(fn () => $this->controller()->refund($id), '仅充值订单可退款');
        $this->assertSame('paid', $this->orderRow($id)['status']);
    }

    public function testRefundRejectsMissingWallet(): void
    {
        $user = $this->uuid();
        $id   = $this->seedOrder($user, ['amount_cny' => 50]);
        $this->postRequest([]);

        $this->expect400(fn () => $this->controller()->refund($id), '钱包不存在');
        $this->assertSame('paid', $this->orderRow($id)['status']);
    }

    public function testRefundRejectsInsufficientBalance(): void
    {
        $user = $this->uuid();
        $id   = $this->seedOrder($user, ['amount_cny' => 100]);
        $this->seedWallet($user, 30);
        $this->postRequest([]);

        $this->expect400(fn () => $this->controller()->refund($id), '余额不足以退款');
        $this->assertSame('paid', $this->orderRow($id)['status']);
        $this->assertSame(30.0, (float) $this->rows('SELECT balance_cny FROM wallets WHERE user_id = ?', [$user])[0]['balance_cny']);
        $this->assertCount(0, $this->ledgerRows($user));
    }

    public function testRefundSuccessDebitsWalletAndWritesNegativeLedger(): void
    {
        $user = $this->uuid();
        $id   = $this->seedOrder($user, ['amount_cny' => 100]);
        $this->seedWallet($user, 150);
        $this->postRequest([]);

        $data = $this->body($this->controller()->refund($id))['data'];
        $this->assertSame('refunded', $data['status']);

        $this->assertSame('refunded', $this->orderRow($id)['status']);
        $this->assertSame(50.0, (float) $this->rows('SELECT balance_cny FROM wallets WHERE user_id = ?', [$user])[0]['balance_cny']);

        $ledger = $this->ledgerRows($user);
        $this->assertCount(1, $ledger);
        $this->assertSame('refund', $ledger[0]['entry_type']);
        $this->assertSame(-100.0, (float) $ledger[0]['amount_cny']);
        $this->assertSame(50.0, (float) $ledger[0]['balance_after']);
    }

    public function testRefundTwiceRejected(): void
    {
        $user = $this->uuid();
        $id   = $this->seedOrder($user, ['amount_cny' => 100]);
        $this->seedWallet($user, 150);

        $this->postRequest([]);
        $this->body($this->controller()->refund($id));

        $this->postRequest([]);
        $this->expect400(fn () => $this->controller()->refund($id), '订单已退款');

        // 只退一次
        $this->assertSame(50.0, (float) $this->rows('SELECT balance_cny FROM wallets WHERE user_id = ?', [$user])[0]['balance_cny']);
        $this->assertCount(1, $this->ledgerRows($user));
    }
}
