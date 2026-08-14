<?php
declare(strict_types=1);

namespace tests\integration;

use app\controller\dashboard\PriceRule as PriceRuleController;
use app\model\PriceMultiplierRule;
use think\exception\HttpException;
use think\facade\Db;

/**
 * PriceRule 控制器集成测试（时间窗倍率规则）。
 *
 * 重点覆盖时间窗时区口径契约：
 * - timezone 必须是 pg_timezone_names 认可的名字（executor 求值对非法名静默回退 UTC，
 *   显示≠执行的隐患在写入入口挡掉）；
 * - start/end/days_of_week 为规则时区墙上时间的纯字符串透传；
 * - effective_from/until 归一化为 UTC 绝对时刻落库，出参统一 UTC ISO。
 */
final class PriceRuleControllerTest extends IntegrationTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Db::connect('pgsql')->execute('TRUNCATE TABLE price_multiplier_rules RESTART IDENTITY CASCADE');
    }

    private function controller(): PriceRuleController
    {
        return new PriceRuleController(app());
    }

    /** 断言给定的 post 输入触发 400 HttpException */
    private function expect400(array $post, string $needle = ''): void
    {
        $this->postRequest($post);
        $this->expectException(HttpException::class);
        try {
            $this->controller()->create();
        } catch (HttpException $e) {
            $this->assertSame(400, $e->getStatusCode());
            if ($needle !== '') {
                $this->assertStringContainsString($needle, $e->getMessage());
            }
            throw $e;
        }
    }

    /** 发起创建并返回响应 data（success(Json) 的 data 即未序列化的模型实例） */
    private function createRule(array $post): PriceMultiplierRule
    {
        $this->postRequest($post);
        return $this->body($this->controller()->create())['data'];
    }

    /** 从库里直读规则行（模型 days_of_week 为 Raw 内联写入，读回才可靠；每用例已清表，取唯一行） */
    private function dbRow(): array
    {
        return Db::connect('pgsql')->query(
            'SELECT timezone, days_of_week::text AS days, start_time, end_time, effective_from, effective_until FROM price_multiplier_rules LIMIT 1',
        )[0];
    }

    /* ----------------------------- 默认值 ----------------------------- */

    public function testCreateFillsTimeWindowDefaults(): void
    {
        $rule = $this->createRule([
            'side' => 'user',
            'provider_id' => '',
            'model_id' => '',
            'multiplier' => 2,
        ]);

        $row = $this->dbRow();
        $this->assertSame('Asia/Shanghai', $row['timezone']);
        $this->assertSame('00:00', $row['start_time']);
        $this->assertSame('24:00', $row['end_time']);
        $this->assertSame('{}', $row['days']);
        $this->assertNull($row['effective_from']);
        $this->assertNull($row['effective_until']);
    }

    /* ----------------------------- 时区校验 ----------------------------- */

    public function testCreateRejectsUnknownTimezone(): void
    {
        $this->expect400([
            'side' => 'user', 'multiplier' => 2,
            'timezone' => 'Mars/Olympus_Mons',
        ], 'timezone 非法');
    }

    public function testCreateAcceptsPgCanonicalTimezone(): void
    {
        $rule = $this->createRule([
            'side' => 'upstream', 'multiplier' => 1.5,
            'timezone' => 'America/New_York',
            'start_time' => '09:00', 'end_time' => '12:00',
        ]);
        $this->assertSame('America/New_York', $rule->timezone);
    }

    /* ----------------------------- 时间窗校验 ----------------------------- */

    public function testCreateRejectsEqualStartEnd(): void
    {
        $this->expect400([
            'side' => 'user', 'multiplier' => 2,
            'start_time' => '09:00', 'end_time' => '09:00',
        ], '不能相等');
    }

    public function testCreateRejectsMalformedTime(): void
    {
        $this->expect400([
            'side' => 'user', 'multiplier' => 2,
            'start_time' => '9:00', 'end_time' => '12:00',
        ], 'start_time 格式非法');

        $this->expect400([
            'side' => 'user', 'multiplier' => 2,
            'start_time' => '00:00', 'end_time' => '25:00',
        ], 'end_time 格式非法');
    }

    public function testCreateAcceptsMidnightCrossingWindow(): void
    {
        $rule = $this->createRule([
            'side' => 'user', 'multiplier' => 2,
            'start_time' => '22:00', 'end_time' => '06:00',
        ]);
        $this->assertSame('22:00', $rule->start_time);
        $this->assertSame('06:00', $rule->end_time);
    }

    public function testCreateRejectsInvalidDayOfWeek(): void
    {
        $this->expect400([
            'side' => 'user', 'multiplier' => 2,
            'days_of_week' => [1, 8],
        ], 'days_of_week');
    }

    /* ----------------------------- 生效区间 ----------------------------- */

    public function testCreateRejectsInvertedEffectiveRange(): void
    {
        $this->expect400([
            'side' => 'user', 'multiplier' => 2,
            'effective_from' => '2026-08-18T00:00:00Z',
            'effective_until' => '2026-08-17T00:00:00Z',
        ], 'effective_from 须早于');
    }

    public function testListNormalizesEffectiveRangeToUtcIso(): void
    {
        $this->createRule([
            'side' => 'user', 'multiplier' => 2,
            'timezone' => 'Asia/Shanghai',
            'start_time' => '09:00', 'end_time' => '12:00',
            'days_of_week' => [2, 1],
            // 北京时间 2026-08-17 00:00 = UTC 2026-08-16 16:00（DeepSeek 峰谷新价生效时刻）
            'effective_from' => '2026-08-17T00:00:00+08:00',
        ]);

        $this->getRequest([]);
        $body = $this->body($this->controller()->list())['data'];
        $this->assertSame(1, $body['total']);

        $r = $body['list'][0];
        $this->assertSame('Asia/Shanghai', $r['timezone']);
        $this->assertSame('09:00', $r['start_time']);
        $this->assertSame('12:00', $r['end_time']);
        $this->assertSame([1, 2], $r['days_of_week']);
        $this->assertSame('2026-08-16T16:00:00+00:00', $r['effective_from']);
        $this->assertNull($r['effective_until']);
    }

    /* ----------------------------- 存量兼容 ----------------------------- */

    public function testListExposesLegacyFullDayRule(): void
    {
        // 存量规则写法：UTC + 00:00-23:59 全天（旧后台硬编码默认值）。
        // think-orm 对 integer[] 的类型推断会强转字符串字面量，故直接原生插入。
        Db::connect('pgsql')->execute(
            "INSERT INTO price_multiplier_rules (side, timezone, days_of_week, start_time, end_time, multiplier, priority, compose_mode, status)
             VALUES ('user', 'UTC', '{}', '00:00', '23:59', 1.5, 0, 'set', 'active')",
        );

        $this->getRequest([]);
        $body = $this->body($this->controller()->list())['data'];
        $this->assertSame(1, $body['total']);
        $this->assertSame('23:59', $body['list'][0]['end_time']);
        $this->assertSame([], $body['list'][0]['days_of_week']);
    }
}
