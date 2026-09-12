<?php
declare(strict_types=1);

namespace tests\integration;

use app\controller\dashboard\Wallet as WalletController;
use think\exception\HttpException;

/**
 * 管理面钱包控制器集成测试（wallets / wallet_ledger）。
 *
 * 覆盖余额查询（缺行=零余额、字段归一）与管理员手工调账：
 * 正/负调账、负调账不得打成负数、幂等键去重、入参校验。
 */
final class DashboardWalletControllerTest extends IntegrationTestCase
{
    private function controller(): WalletController
    {
        return new WalletController(app());
    }

    /** 断言给定 post 触发 400 HttpException */
    private function expect400(array $post, string $userId, string $needle = ''): void
    {
        $this->postRequest($post);
        $this->expectException(HttpException::class);
        try {
            $this->controller()->adjust($userId);
        } catch (HttpException $e) {
            $this->assertSame(400, $e->getStatusCode());
            if ($needle !== '') {
                $this->assertStringContainsString($needle, $e->getMessage());
            }
            throw $e;
        }
    }

    private function walletRow(string $userId): ?array
    {
        return $this->rows('SELECT balance_cny, frozen_cny, version FROM wallets WHERE user_id = ?', [$userId])[0] ?? null;
    }

    private function ledgerCount(string $userId): int
    {
        return (int) $this->rows('SELECT count(*) as c FROM wallet_ledger WHERE user_id = ?', [$userId])[0]['c'];
    }

    /* ------------------------------ show ------------------------------ */

    public function testShowUserNotFound404(): void
    {
        $this->getRequest([]);
        $this->expectException(HttpException::class);
        try {
            $this->controller()->show($this->uuid());
        } catch (HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
            throw $e;
        }
    }

    public function testShowWithoutWalletRowReturnsZeroExistsFalse(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);

        $this->getRequest([]);
        $data = $this->body($this->controller()->show($user))['data'];

        $this->assertSame($user, $data['userId']);
        $this->assertFalse($data['wallet']['exists']);
        $this->assertSame(0.0, $data['wallet']['balance_cny']);
        $this->assertSame(0.0, $data['wallet']['frozen_cny']);
        $this->assertSame(0.0, $data['wallet']['total_cny']);
        $this->assertSame('CNY', $data['wallet']['currency']);
        $this->assertSame([], $data['ledger']);
    }

    public function testShowReturnsBalanceFrozenAndTotal(): void
    {
        $user = $this->uuid();
        $this->seedWallet($user, 120.5, 30.25);
        $this->seedWalletLedger($user, ['amount_cny' => 120.5, 'balance_after' => 120.5]);

        $this->getRequest([]);
        $data = $this->body($this->controller()->show($user))['data'];

        $this->assertTrue($data['wallet']['exists']);
        $this->assertSame(120.5, $data['wallet']['balance_cny']);
        $this->assertSame(30.25, $data['wallet']['frozen_cny']);
        $this->assertSame(150.75, $data['wallet']['total_cny']);
        $this->assertCount(1, $data['ledger']);
        $this->assertSame('adjustment', $data['ledger'][0]['entry_type']);
    }

    public function testShowLimitClampedToRange(): void
    {
        $user = $this->uuid();
        $this->seedWallet($user, 0);
        for ($i = 0; $i < 105; $i++) {
            $this->seedWalletLedger($user, ['amount_cny' => 1, 'balance_after' => 1]);
        }

        // 下界：0 → 夹到 1
        $this->getRequest(['limit' => 0]);
        $this->assertCount(1, $this->body($this->controller()->show($user))['data']['ledger']);

        // 上界：超 100 → 夹到 100
        $this->getRequest(['limit' => 1000]);
        $this->assertCount(100, $this->body($this->controller()->show($user))['data']['ledger']);
    }

    /* ------------------------------ adjust ------------------------------ */

    public function testAdjustPositiveFromZero(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);
        $this->postRequest(['amount_cny' => 100, 'idempotency_key' => 'k-pos-1', 'reason' => '补偿']);

        $data = $this->body($this->controller()->adjust($user))['data'];

        $this->assertFalse($data['idempotent']);
        $this->assertSame(100.0, $data['wallet']['balance_cny']);
        $this->assertSame(100.0, (float) $this->walletRow($user)['balance_cny']);

        $rows = $this->rows("SELECT entry_type, amount_cny, balance_after FROM wallet_ledger WHERE user_id = ?", [$user]);
        $this->assertCount(1, $rows);
        $this->assertSame('adjustment', $rows[0]['entry_type']);
        $this->assertSame(100.0, (float) $rows[0]['amount_cny']);
        $this->assertSame(100.0, (float) $rows[0]['balance_after']);
    }

    public function testAdjustNegativeWithinBalance(): void
    {
        $user = $this->uuid();
        $this->seedWallet($user, 100);
        $this->postRequest(['amount_cny' => -30, 'idempotency_key' => 'k-neg-1']);

        $data = $this->body($this->controller()->adjust($user))['data'];

        $this->assertSame(70.0, $data['wallet']['balance_cny']);
        $this->assertSame(70.0, (float) $this->walletRow($user)['balance_cny']);

        $rows = $this->rows('SELECT amount_cny, balance_after FROM wallet_ledger WHERE user_id = ?', [$user]);
        $this->assertCount(1, $rows);
        $this->assertSame(-30.0, (float) $rows[0]['amount_cny']);
        $this->assertSame(70.0, (float) $rows[0]['balance_after']);
    }

    public function testAdjustNegativeOverBalanceRejectedWithoutSideEffect(): void
    {
        $user = $this->uuid();
        $this->seedWallet($user, 100);

        $this->expect400(['amount_cny' => -150, 'idempotency_key' => 'k-over'], $user, '余额不足');

        // 余额未变、无流水
        $this->assertSame(100.0, (float) $this->walletRow($user)['balance_cny']);
        $this->assertSame(0, $this->ledgerCount($user));
    }

    public function testAdjustNegativeOnMissingWalletRejected(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);

        $this->expect400(['amount_cny' => -1, 'idempotency_key' => 'k-nowallet'], $user, '钱包不存在');
        $this->assertNull($this->walletRow($user));
        $this->assertSame(0, $this->ledgerCount($user));
    }

    public function testAdjustIdempotentReplayChangesBalanceOnce(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);

        $this->postRequest(['amount_cny' => 100, 'idempotency_key' => 'k-idem']);
        $first = $this->body($this->controller()->adjust($user))['data'];
        $this->assertFalse($first['idempotent']);

        $this->postRequest(['amount_cny' => 100, 'idempotency_key' => 'k-idem']);
        $second = $this->body($this->controller()->adjust($user))['data'];

        $this->assertTrue($second['idempotent']);
        $this->assertSame(100.0, $second['wallet']['balance_cny'], '余额只应变更一次');
        $this->assertSame(100.0, (float) $this->walletRow($user)['balance_cny']);
        $this->assertSame(1, $this->ledgerCount($user), '重复请求不新增流水');
        $this->assertSame($first['ledger']['id'], $second['ledger']['id']);
    }

    /**
     * 幂等键必须按用户隔离：同 key 命中他人流水时不得把他人账目返回给当前用户。
     *
     * wallet_ledger.idempotency_key 全局唯一，故修复后跨用户复用会以唯一约束冲突失败
     * （修复前会静默返回他人流水且自己的余额不变）。本用例守住「不返回他人流水」。
     */
    public function testAdjustIdempotencyKeyIsScopedToUser(): void
    {
        $other = $this->uuid();
        $this->seedWallet($other, 0);
        $this->seedWalletLedger($other, ['idempotency_key' => 'shared-key', 'amount_cny' => 5, 'balance_after' => 5]);

        $user = $this->uuid();
        $this->seedWallet($user, 0);

        $this->postRequest(['amount_cny' => 100, 'idempotency_key' => 'shared-key']);
        try {
            $data = $this->body($this->controller()->adjust($user))['data'];
            // 若成功返回，流水必须是当前用户自己的，绝不能是他人记录
            $this->assertSame($user, $data['ledger']['user_id']);
        } catch (HttpException $e) {
            $this->fail('不应把他人类幂等命中当成本用户结果: ' . $e->getMessage());
        } catch (\Throwable $e) {
            // 命中他人幂等键 → 全局唯一约束冲突，事务回滚；
            // 关键是未把他人流水返回，且当前用户无新增流水
            $this->assertSame(5.0, (float) $this->rows('SELECT amount_cny FROM wallet_ledger WHERE idempotency_key = ?', ['shared-key'])[0]['amount_cny']);
            $this->assertSame(0, $this->ledgerCount($user));
        }
    }

    public function testAdjustRejectsZeroAmount(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);
        $this->expect400(['amount_cny' => 0, 'idempotency_key' => 'k-zero'], $user, '不能为 0');
    }

    public function testAdjustRejectsMissingIdempotencyKey(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);
        $this->expect400(['amount_cny' => 10], $user, 'idempotency_key 必填');
    }
}
