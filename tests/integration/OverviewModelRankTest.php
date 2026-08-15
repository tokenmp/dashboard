<?php
declare(strict_types=1);

namespace tests\integration;

use app\controller\dashboard\Overview as DashboardOverview;
use app\controller\panel\Overview as PanelOverview;
use app\model\User as UserModel;

/**
 * Overview 模型用量排行集成测试(panel 自身 / dashboard 全平台)。
 *
 * 验证 think-orm 聚合查询:按实际调用次数降序(次序 token)、requests/successes 正确、
 * panel 数据隔离、period 时间窗过滤(today / 7d 含今日 / 本月)。
 * 时间断言不绑定具体日期串,只按「相对今天的天数」种数据(时区无关)。
 */
final class OverviewModelRankTest extends IntegrationTestCase
{
    private function panelModels(array $get = []): array
    {
        $this->getRequest($get);
        return $this->body((new PanelOverview(app()))->models())['data'];
    }

    private function dashboardModels(array $get = []): array
    {
        $this->getRequest($get);
        return $this->body((new DashboardOverview(app()))->models())['data'];
    }

    private function actingAs(string $userId, string $role = 'user'): void
    {
        app()->instance('user', new UserModel(['id' => $userId, 'role' => $role]));
    }

    /* ------------------------------ panel ------------------------------ */

    public function testPanelRanksByRequestsDescWithTokenCounts(): void
    {
        $user = $this->uuid();
        $this->actingAs($user);
        // glm:2 次 400 token;kimi:2 次 510 token(一次失败);qwen:1 次 12 token
        $this->seedRequestLog($user, ['model_name' => 'glm-4.7', 'success' => true, 'total_tokens' => 300]);
        $this->seedRequestLog($user, ['model_name' => 'glm-4.7', 'success' => true, 'total_tokens' => 100]);
        $this->seedRequestLog($user, ['model_name' => 'kimi-k2', 'success' => true, 'total_tokens' => 500]);
        $this->seedRequestLog($user, ['model_name' => 'kimi-k2', 'success' => false, 'total_tokens' => 10]);
        $this->seedRequestLog($user, ['model_name' => 'qwen-3.5', 'success' => true, 'total_tokens' => 12]);

        $rank = $this->panelModels();

        // 按实际调用次数降序;次数并列(2=2)时按 token 降序:kimi-k2(510) > glm-4.7(400) > qwen-3.5(1 次)
        $this->assertSame('kimi-k2', $rank[0]['model']);
        $this->assertSame(510, $rank[0]['tokens']);
        $this->assertSame(2, $rank[0]['requests']);
        $this->assertSame(1, $rank[0]['successes']); // 一条失败
        $this->assertSame('glm-4.7', $rank[1]['model']);
        $this->assertSame(400, $rank[1]['tokens']);
        $this->assertSame(2, $rank[1]['requests']);
        $this->assertSame(2, $rank[1]['successes']);
        $this->assertSame('qwen-3.5', $rank[2]['model']);
    }

    public function testPanelIsolatesToOwnData(): void
    {
        $me    = $this->uuid();
        $other = $this->uuid();
        $this->actingAs($me);
        $this->seedRequestLog($me, ['model_name' => 'glm-4.7', 'total_tokens' => 100]);
        $this->seedRequestLog($other, ['model_name' => 'glm-4.7', 'total_tokens' => 9999]);

        $rank = $this->panelModels();

        $this->assertCount(1, $rank);
        $this->assertSame(100, $rank[0]['tokens']);
    }

    public function testPanelPeriodFilters(): void
    {
        $user = $this->uuid();
        $this->actingAs($user);
        // 今日 / 8 天前 / 40 天前各一条
        $this->seedRequestLog($user, ['model_name' => 'today-model', 'total_tokens' => 10]);
        $this->seedRequestLog($user, ['model_name' => 'd8-model', 'total_tokens' => 20, 'created_at' => date('Y-m-d H:i:s', strtotime('-8 days'))]);
        $this->seedRequestLog($user, ['model_name' => 'd40-model', 'total_tokens' => 30, 'created_at' => date('Y-m-d H:i:s', strtotime('-40 days'))]);

        // today:只有今天
        $rank = $this->panelModels(['period' => 'today']);
        $this->assertSame(['today-model'], array_column($rank, 'model'));

        // 7d(近 7 天含今日):今天 + 8 天前的边界外——只含今天
        $rank = $this->panelModels(['period' => '7d']);
        $this->assertSame(['today-model'], array_column($rank, 'model'));

        // month:只排除 40 天前(跨月);8 天前是否在「本月」取决于当天日期(月初 8 天可能跨月),
        // 故只断言 40 天前绝不在结果中。
        $rank = $this->panelModels(['period' => 'month']);
        $models = array_column($rank, 'model');
        $this->assertNotContains('d40-model', $models);
        $this->assertContains('today-model', $models);
    }

    public function testPanelInvalidPeriodFallsBackToToday(): void
    {
        $user = $this->uuid();
        $this->actingAs($user);
        $this->seedRequestLog($user, ['model_name' => 'a', 'total_tokens' => 1]);
        $this->seedRequestLog($user, ['model_name' => 'b', 'total_tokens' => 2, 'created_at' => date('Y-m-d H:i:s', strtotime('-40 days'))]);

        $rank = $this->panelModels(['period' => 'evil; drop table']);

        $this->assertSame(['a'], array_column($rank, 'model'));
    }

    public function testPanelEmptyWhenNoData(): void
    {
        $this->actingAs($this->uuid());
        $this->assertSame([], $this->panelModels());
    }

    /* ----------------------------- dashboard ----------------------------- */

    public function testDashboardAggregatesAcrossUsers(): void
    {
        $u1 = $this->uuid();
        $u2 = $this->uuid();
        $this->actingAs($u1, 'admin');
        $this->seedRequestLog($u1, ['model_name' => 'glm-4.7', 'total_tokens' => 100]);
        $this->seedRequestLog($u2, ['model_name' => 'glm-4.7', 'total_tokens' => 200]);
        $this->seedRequestLog($u2, ['model_name' => 'kimi-k2', 'total_tokens' => 50]);
        $this->seedRequestLog($u2, ['model_name' => 'kimi-k2', 'total_tokens' => 60]);
        $this->seedRequestLog($u2, ['model_name' => 'kimi-k2', 'total_tokens' => 0]);

        $rank = $this->dashboardModels();

        // 全平台按调用次数降序:kimi-k2=3 次(110 token) > glm-4.7=2 次(300 token)
        $this->assertCount(2, $rank);
        $this->assertSame('kimi-k2', $rank[0]['model']);
        $this->assertSame(3, $rank[0]['requests']);
        $this->assertSame(110, $rank[0]['tokens']);
        $this->assertSame('glm-4.7', $rank[1]['model']);
        $this->assertSame(2, $rank[1]['requests']);
        $this->assertSame(300, $rank[1]['tokens']);
    }

    public function testDashboardLimitCap(): void
    {
        $u = $this->uuid();
        $this->actingAs($u, 'admin');
        foreach (['m1', 'm2', 'm3'] as $m) {
            $this->seedRequestLog($u, ['model_name' => $m, 'total_tokens' => 10]);
        }

        $rank = $this->dashboardModels(['limit' => '2']);
        $this->assertCount(2, $rank);

        // 非法 limit 回退默认 10,且 clamp 1-20
        $rank = $this->dashboardModels(['limit' => '999']);
        $this->assertCount(3, $rank);
    }
}
