<?php
declare(strict_types=1);

namespace tests\integration;

use app\controller\dashboard\UserPlan as UserPlanController;
use think\facade\Db;

/**
 * UserPlan 控制器集成测试：发放/续期对既有生效套餐的影响。
 *
 * 契约（PR #32 定义）：
 * - token 发放：互斥替换——停用该用户全部旧 active token 绑定
 * - coding / image 发放：叠加共存——旧绑定保持 active，不受影响
 * - 续期：只延长 expires_at，不改 activated_at（不重置任何用量窗口）
 */
final class UserPlanGrantEffectTest extends IntegrationTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Db::connect('pgsql')->execute('TRUNCATE TABLE user_plans, plans RESTART IDENTITY CASCADE');
    }

    private function controller(): UserPlanController
    {
        return new UserPlanController(app());
    }

    /** 发起发放（响应 data 为模型实例，本测试只关心副作用，不取返回值） */
    private function grant(string $userId, string $planId, array $body = []): void
    {
        $this->postRequest(array_merge(['plan_id' => $planId], $body));
        $this->controller()->grant($userId);
    }

    private function bindingStatus(string $userPlanId): string
    {
        return Db::connect('pgsql')->query(
            'SELECT status FROM user_plans WHERE id = ?',
            [$userPlanId],
        )[0]['status'];
    }

    public function testGrantTokenDisablesOldTokenBinding(): void
    {
        $userId = $this->uuid();
        $this->seedUser($userId);
        $oldPlan = $this->seedPlan(['plan_type' => 'token', 'token_limit' => 1000]);
        $newPlan = $this->seedPlan(['plan_type' => 'token', 'token_limit' => 500]);
        $oldBinding = $this->seedUserPlan($userId, $oldPlan);

        $this->grant($userId, $newPlan, ['permanent' => true]);

        $this->assertSame('disabled', $this->bindingStatus($oldBinding), 'token 发放应停用旧 token 绑定（互斥）');
        $newBindings = Db::connect('pgsql')->query(
            "SELECT id FROM user_plans WHERE user_id = ? AND plan_id = ? AND status = 'active'",
            [$userId, $newPlan],
        );
        $this->assertCount(1, $newBindings, '应新建一条 active 新绑定');
    }

    public function testGrantCodingKeepsOldCodingBindingActive(): void
    {
        $userId = $this->uuid();
        $this->seedUser($userId);
        $oldPlan = $this->seedPlan(['plan_type' => 'coding', 'cycle_limit' => 3, 'cycle_days' => 1]);
        $newPlan = $this->seedPlan(['plan_type' => 'coding', 'cycle_limit' => 5, 'cycle_days' => 1]);
        $oldBinding = $this->seedUserPlan($userId, $oldPlan, ['plan_type' => 'coding']);

        $this->grant($userId, $newPlan, ['permanent' => true]);

        $this->assertSame('active', $this->bindingStatus($oldBinding), 'coding 发放不得影响旧 coding 绑定（叠加共存）');
        $count = Db::connect('pgsql')->query(
            "SELECT count(*) AS c FROM user_plans WHERE user_id = ? AND status = 'active' AND plan_type = 'coding'",
            [$userId],
        )[0]['c'];
        $this->assertSame(2, (int) $count, 'coding 新旧绑定应共存两条 active');
    }

    public function testGrantImageKeepsOldImageBindingActive(): void
    {
        $userId = $this->uuid();
        $this->seedUser($userId);
        $oldPlan = $this->seedPlan(['plan_type' => 'image', 'token_limit' => 100]);
        $newPlan = $this->seedPlan(['plan_type' => 'image', 'token_limit' => 200]);
        $oldBinding = $this->seedUserPlan($userId, $oldPlan, ['plan_type' => 'image']);

        $this->grant($userId, $newPlan, ['permanent' => true]);

        $this->assertSame('active', $this->bindingStatus($oldBinding), 'image 发放不得影响旧 image 绑定（叠加共存）');
    }

    public function testRenewDoesNotTouchActivatedAt(): void
    {
        $userId = $this->uuid();
        $this->seedUser($userId);
        $plan = $this->seedPlan(['plan_type' => 'coding', 'cycle_limit' => 10, 'cycle_days' => 1]);
        $binding = $this->seedUserPlan($userId, $plan, ['plan_type' => 'coding', 'activated_at' => '2026-08-01 10:00:00+08']);
        $before = Db::connect('pgsql')->query(
            'SELECT activated_at, windows_reset_at FROM user_plans WHERE id = ?',
            [$binding],
        )[0];

        $this->postRequest(['duration_days' => 30]);
        $this->body($this->controller()->renew($userId, $binding));

        $after = Db::connect('pgsql')->query(
            'SELECT activated_at, windows_reset_at FROM user_plans WHERE id = ?',
            [$binding],
        )[0];
        $this->assertSame($before['activated_at'], $after['activated_at'], '续期不得改 activated_at（防窗口重置）');
        $this->assertSame($before['windows_reset_at'], $after['windows_reset_at'], '续期不得动短期窗重置锚点');
    }
}
