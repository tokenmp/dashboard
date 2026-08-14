<?php
declare(strict_types=1);

namespace tests\integration;

use app\controller\panel\User as PanelUserController;
use app\enums\CodingPlanStrategy;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 扣费套餐选择策略：panel 接口 + 枚举行为。
 */
final class CodingPlanStrategyTest extends IntegrationTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Db::connect('pgsql')->execute('TRUNCATE TABLE user_plans, plans RESTART IDENTITY CASCADE');
    }

    private function controller(): PanelUserController
    {
        return new PanelUserController(app());
    }

    private function actingAs(string $userId): void
    {
        app()->instance('user', new \app\model\User(['id' => $userId, 'role' => 'user']));
    }

    private function putStrategy(string $userId, string $strategy)
    {
        $this->actingAs($userId);
        // 控制器读 put()、缺省回退 post()；测试环境注入 post 即可
        $req = (new \think\Request())->withPost(['strategy' => $strategy]);
        app()->instance('request', $req);
        return $this->controller()->updatePlanStrategy();
    }

    public function testProfileExposesDefaultStrategy(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);

        $this->actingAs($user);
        app()->instance('request', new \think\Request());
        $body = $this->body($this->controller()->profile())['data'];

        $this->assertSame(CodingPlanStrategy::defaultStored(), $body['coding_plan_strategy']);
        $this->assertSame(
            ['soonest_expiry', 'smallest_limit', 'least_remaining', 'oldest_first'],
            array_map(fn (CodingPlanStrategy $s) => $s->value, CodingPlanStrategy::DEFAULT_LIST),
        );
    }

    public function testUpdatePersistsValidOrderedList(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);

        $body = $this->body($this->putStrategy($user, 'largest_limit, newest_first'))['data'];

        $this->assertSame('largest_limit,newest_first', $body['coding_plan_strategy']);
        $stored = Db::connect('pgsql')->query(
            'SELECT coding_plan_strategy FROM users WHERE id = ?',
            [$user],
        )[0]['coding_plan_strategy'];
        $this->assertSame('largest_limit,newest_first', $stored);
    }

    public function testUpdateRejectsInvalidKey(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);

        $this->expectException(HttpException::class);
        try {
            $this->putStrategy($user, 'biggest_limit');
        } catch (HttpException $e) {
            $this->assertSame(400, $e->getStatusCode());
            throw $e;
        }
    }

    public function testUpdateRejectsDuplicateAndEmpty(): void
    {
        $user = $this->uuid();
        $this->seedUser($user);

        try {
            $this->putStrategy($user, 'soonest_expiry,soonest_expiry');
            $this->fail('重复 key 应 400');
        } catch (HttpException $e) {
            $this->assertSame(400, $e->getStatusCode());
        }

        try {
            $this->putStrategy($user, '');
            $this->fail('空串应 400');
        } catch (HttpException $e) {
            $this->assertSame(400, $e->getStatusCode());
        }
    }

    public function testEnumLenientParseFallsBackToDefault(): void
    {
        $this->assertSame(
            CodingPlanStrategy::DEFAULT_LIST,
            CodingPlanStrategy::parseListLenient('not_a_strategy'),
        );
        $this->assertSame(
            CodingPlanStrategy::DEFAULT_LIST,
            CodingPlanStrategy::parseListLenient(null),
        );
        $this->assertSame(
            ['largest_limit', 'newest_first'],
            array_map(fn (CodingPlanStrategy $s) => $s->value, CodingPlanStrategy::parseListLenient('largest_limit,newest_first')),
        );
    }
}
