<?php
declare(strict_types=1);

namespace tests\integration;

use app\controller\panel\Overview as PanelOverview;
use app\model\User as UserModel;

/**
 * panel Overview 控制器集成测试(用户面概览,自取数据)。
 *
 * 验证 DataScope::forSelf 的自身数据隔离 + 今日 KPI(请求数/token/成功率)+
 * 30 天趋势补零。管理员在 panel 也只看自己。
 */
final class PanelOverviewControllerTest extends IntegrationTestCase
{
    private function overview(): array
    {
        return $this->body((new PanelOverview(app()))->overview())['data'];
    }

    private function actingAs(string $userId): void
    {
        app()->instance('user', new UserModel(['id' => $userId, 'role' => 'user']));
    }

    public function testOverviewReturnsTodayKpiAndTrend(): void
    {
        $user = $this->uuid();
        $this->actingAs($user);
        // 今日:2 成功(tokens 100/200)+ 1 失败(tokens 50)
        $this->seedRequestLog($user, ['success' => true, 'total_tokens' => 100]);
        $this->seedRequestLog($user, ['success' => true, 'total_tokens' => 200]);
        $this->seedRequestLog($user, ['success' => false, 'total_tokens' => 50]);

        $data = $this->overview();

        $this->assertSame('user', $data['role']);
        $kpi = $data['kpi'];
        $this->assertSame(3, $kpi['todayRequests']);
        $this->assertSame(350, $kpi['todayTokens']);
        $this->assertSame(0.6667, $kpi['todaySuccessRate']); // 2/3

        // 趋势固定 30 天;只有「今天」有数据(requests=3, tokens=350, successes=2)。
        // 不绑定具体日期串(依赖会话时区),改为按「有数据的天」断言,时区无关。
        $this->assertCount(30, $data['trend']);
        $nonZero = array_filter($data['trend'], fn ($e) => $e['requests'] > 0);
        $this->assertCount(1, $nonZero);
        $todayEntry = reset($nonZero);
        $this->assertSame(3, $todayEntry['requests']);
        $this->assertSame(350, $todayEntry['tokens']); // sum(全部 total_tokens)
        $this->assertSame(2, $todayEntry['successes']);
    }

    public function testOverviewIsolatesToOwnDataOnly(): void
    {
        // DataScope::forSelf:即使别的用户有数据,也只统计自己
        $me     = $this->uuid();
        $other  = $this->uuid();
        $this->actingAs($me);

        $this->seedRequestLog($me, ['success' => true, 'total_tokens' => 100]);
        $this->seedRequestLog($me, ['success' => true, 'total_tokens' => 100]);
        // 别人的数据,绝不应计入
        $this->seedRequestLog($other, ['success' => true, 'total_tokens' => 9999]);
        $this->seedRequestLog($other, ['success' => false, 'total_tokens' => 9999]);

        $data = $this->overview();

        $this->assertSame(2, $data['kpi']['todayRequests']);
        $this->assertSame(200, $data['kpi']['todayTokens']);
        $this->assertSame(1.0, $data['kpi']['todaySuccessRate']);
    }

    public function testOverviewSuccessRateNullWhenNoRequests(): void
    {
        // 无请求时成功率应为 null(避免除零)
        $user = $this->uuid();
        $this->actingAs($user);

        $data = $this->overview();

        $this->assertSame(0, $data['kpi']['todayRequests']);
        $this->assertNull($data['kpi']['todaySuccessRate']);
        $this->assertSame([], $data['quota']); // 无套餐
    }
}
