<?php
declare(strict_types=1);

namespace tests\integration;

use app\controller\site\Site as SiteController;
use think\facade\Db;

/**
 * Site 公开接口集成测试（landing 页游客数据）。
 *
 * 覆盖点：
 * - models：目录可见性口径 = executor /v1/models（active 模型 × active 映射 ×
 *   active 密钥 × active 供应商 × active 端点，任一环 disabled 即不可见）；
 * - models：倍率取 price_multiplier_rules（side=user）当前时刻的 set/multiply 组合值，
 *   多供应商时展示最小值；
 * - plans：只返回上架（active）套餐；
 * - overview：模型数 / 供应商数 / 最低倍率。
 *
 * 每用例清空目录相关表（基类只清业务表），避免手工 seed 残留干扰。
 */
final class SiteControllerTest extends IntegrationTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->truncateCatalog();
    }

    protected function tearDown(): void
    {
        $this->truncateCatalog();
        parent::tearDown();
    }

    private function truncateCatalog(): void
    {
        Db::connect('pgsql')->execute(
            'TRUNCATE TABLE price_multiplier_rules, upstream_model_mappings, '
            . 'provider_endpoints, upstream_keys, models, providers RESTART IDENTITY CASCADE'
        );
    }

    private function controller(): SiteController
    {
        return new SiteController(app());
    }

    /**
     * 建一条完整可见链路：provider → upstream_key → endpoint(openai) ← mapping → model。
     * 返回 model id。$status 可指定把模型置为 disabled。
     */
    private function seedModelChain(string $name, array $modelOpts = []): string
    {
        $conn = $this->conn();
        $providerId = $this->uuid();
        $conn->execute(
            "INSERT INTO providers (id, name, display_name, base_url, status) VALUES (?, ?, ?, 'https://example.test', 'active')",
            [$providerId, 'prov-' . substr($providerId, 0, 4), 'Prov']
        );
        $keyId = $this->uuid();
        $conn->execute(
            "INSERT INTO upstream_keys (id, provider_id, name, encrypted_key) VALUES (?, ?, ?, 'x')",
            [$keyId, $providerId, 'key-' . substr($keyId, 0, 4)]
        );
        $conn->execute(
            "INSERT INTO provider_endpoints (id, provider_id, protocol, path) VALUES (?, ?, 'openai', '/v1/chat/completions')",
            [$this->uuid(), $providerId]
        );
        $modelId = $modelOpts['id'] ?? $this->uuid();
        $conn->execute(
            "INSERT INTO models (id, name, status, capabilities, context_window_tokens, max_tokens, billing_mode)
             VALUES (?, ?, ?, '{text,thinking}', 128000, 4096, 'billable')",
            [$modelId, $name, $modelOpts['status'] ?? 'active']
        );
        $conn->execute(
            "INSERT INTO upstream_model_mappings (id, upstream_key_id, model_id, upstream_model_name, status)
             VALUES (?, ?, ?, ?, ?)",
            [$this->uuid(), $keyId, $modelId, $name, $modelOpts['mapping_status'] ?? 'active']
        );

        return $modelId;
    }

    /** 建一条用户侧倍率规则（默认全天生效的 set 规则） */
    private function seedUserRule(array $o = []): void
    {
        $row = [
            'id'        => $o['id'] ?? $this->uuid(),
            'side'      => 'user',
            'model_id'  => $o['model_id'] ?? null,
            'provider_id' => $o['provider_id'] ?? null,
            'multiplier' => $o['multiplier'] ?? 0.5,
            'compose_mode' => $o['compose_mode'] ?? 'set',
            'priority'  => $o['priority'] ?? 0,
            'status'    => $o['status'] ?? 'active',
            'timezone'  => 'UTC',
            'days_of_week' => '{}',
            'start_time' => '00:00',
            'end_time'  => '23:59',
        ];
        $cols = implode(', ', array_map(fn($c) => "\"{$c}\"", array_keys($row)));
        $ph   = implode(', ', array_fill(0, count($row), '?'));
        $this->conn()->execute("INSERT INTO price_multiplier_rules ({$cols}) VALUES ({$ph})", array_values($row));
    }

    public function testModelsListsActiveCatalogWithMultiplier(): void
    {
        $modelId = $this->seedModelChain('glm-test');
        $this->seedModelChain('disabled-model', ['status' => 'disabled']);
        $this->seedUserRule(['model_id' => $modelId, 'multiplier' => 0.5]);

        $body = $this->body($this->controller()->models());

        $this->assertSame(0, $body['code']);
        $list = $body['data']['list'];
        $this->assertCount(1, $list, 'disabled 模型不应出现在公开目录');

        $item = $list[0];
        $this->assertSame('glm-test', $item['name']);
        $this->assertSame('text', $item['capabilities'][0]);
        $this->assertSame(128000, $item['context_window']);
        $this->assertSame(0.5, $item['multiplier'], '模型级 set 规则应生效');
        $this->assertNotEmpty($item['providers']);
        $this->assertSame($item['providers'][0]['name'], $item['owned_by']);
    }

    public function testModelsDefaultMultiplierWithoutRules(): void
    {
        $this->seedModelChain('no-rule-model');

        $body = $this->body($this->controller()->models());

        $this->assertSame(1.0, $body['data']['list'][0]['multiplier'], '无匹配规则时倍率应为 1.0');
    }

    public function testModelsExcludesModelWithDisabledMapping(): void
    {
        $this->seedModelChain('broken-chain', ['mapping_status' => 'disabled']);

        $body = $this->body($this->controller()->models());

        $this->assertSame([], $body['data']['list'], '映射停用的模型不可见（与 /v1/models 口径一致）');
    }

    public function testMultiplyRuleComposesWithSetRule(): void
    {
        $modelId = $this->seedModelChain('compose-model');
        $this->seedUserRule(['model_id' => $modelId, 'multiplier' => 0.5, 'compose_mode' => 'set']);
        $this->seedUserRule(['multiplier' => 3.0, 'compose_mode' => 'multiply']);

        $body = $this->body($this->controller()->models());

        // set(0.5) × multiply(3.0) = 1.5；期望值刻意避开 1.0，防止「无匹配」假阳性
        $this->assertSame(1.5, $body['data']['list'][0]['multiplier']);
    }

    public function testUpstreamSideRuleNotAppliedToUserCatalog(): void
    {
        $modelId = $this->seedModelChain('side-model');
        $this->seedUserRule(['model_id' => $modelId, 'multiplier' => 3.0]);
        // 追加一条 upstream 侧同模型规则：用户侧目录不应受它影响
        $this->conn()->execute(
            "INSERT INTO price_multiplier_rules (id, side, model_id, multiplier, compose_mode, timezone, days_of_week, start_time, end_time)
             VALUES (?, 'upstream', ?, 0.1, 'set', 'UTC', '{}', '00:00', '23:59')",
            [$this->uuid(), $modelId]
        );

        $body = $this->body($this->controller()->models());

        $this->assertSame(3.0, $body['data']['list'][0]['multiplier']);
    }

    public function testModelsIncludeProviderLogo(): void
    {
        // 第一家供应商配置外链 Logo，第二家上传 SVG 源码，第三家未配置
        // （映射不直接挂 provider，需经 upstream_keys 关联取 provider_id）
        $extId = $this->seedModelChain('ext-logo-model');
        $this->conn()->execute(
            'UPDATE providers SET logo_url = ? WHERE id = ('
            . ' SELECT uk.provider_id FROM upstream_model_mappings umm'
            . ' JOIN upstream_keys uk ON uk.id = umm.upstream_key_id WHERE umm.model_id = ?)',
            ['https://cdn.example.com/logo.svg', $extId]
        );

        $svgId = $this->seedModelChain('svg-logo-model');
        $providerId = $this->conn()->query(
            'SELECT uk.provider_id FROM upstream_model_mappings umm'
            . ' JOIN upstream_keys uk ON uk.id = umm.upstream_key_id WHERE umm.model_id = ?',
            [$svgId]
        )[0]['provider_id'];
        $this->conn()->execute(
            "UPDATE providers SET logo_svg = '<svg xmlns=\"http://www.w3.org/2000/svg\"/>' WHERE id = ?",
            [$providerId]
        );

        $this->seedModelChain('no-logo-model');

        $list = $this->body($this->controller()->models())['data']['list'];

        $byName = array_column($list, null, 'name');
        $this->assertSame('https://cdn.example.com/logo.svg', $byName['ext-logo-model']['providers'][0]['logo'], '外链 Logo 原样透出');
        $this->assertSame(
            '/api/v1/site/providers/' . $providerId . '/logo',
            $byName['svg-logo-model']['providers'][0]['logo'],
            'SVG 源码走公开输出端点'
        );
        $this->assertNull($byName['no-logo-model']['providers'][0]['logo'], '未配置时为 null（前端回退内置图标）');

        // logo 端点：SVG 原样输出、Content-Type 正确；未配置的供应商 404
        $logoResp = $this->controller()->providerLogo($providerId);
        $this->assertSame(200, $this->httpCode($logoResp));
        $this->assertSame('image/svg+xml; charset=utf-8', $logoResp->getHeader('Content-Type'));
        $this->assertSame('<svg xmlns="http://www.w3.org/2000/svg"/>', $logoResp->getData());

        $missing = $this->controller()->providerLogo($this->uuid());
        $this->assertSame(404, $this->httpCode($missing));
    }

    public function testPlansListsActiveOnly(): void
    {
        $this->seedPlan(['name' => '体验版', 'plan_type' => 'coding', 'price' => 0, 'cycle_limit' => 1000, 'rolling_5h_limit' => 100]);
        $this->seedPlan(['name' => '已下架', 'plan_type' => 'coding', 'price' => 99, 'status' => 'disabled']);

        $body = $this->body($this->controller()->plans());

        $this->assertSame(0, $body['code']);
        $list = $body['data']['list'];
        $this->assertCount(1, $list, '下架套餐不应出现在公开目录');
        $this->assertSame('体验版', $list[0]['name']);
        $this->assertSame(1000, $list[0]['cycle_limit']);
        $this->assertSame(100, $list[0]['rolling_5h_limit']);
    }

    public function testPlansExcludesHiddenPlans(): void
    {
        $this->seedPlan(['name' => '公开套餐', 'plan_type' => 'coding', 'price' => 10, 'public_visible' => 'true']);
        $this->seedPlan(['name' => '内部定制', 'plan_type' => 'coding', 'price' => 99, 'public_visible' => 'false']);

        $body = $this->body($this->controller()->plans());

        $list = $body['data']['list'];
        $this->assertCount(1, $list, 'public_visible=false 的套餐不应出现在公开目录');
        $this->assertSame('公开套餐', $list[0]['name']);
    }

    public function testDashboardPlanVisibilityRoundtrip(): void
    {
        // 创建隐藏套餐：public_visible=false 经 PDO 绑定必须可写（回归守卫：PHP false 曾被绑成空串导致 22P02）
        // 注意：控制器必须在 postRequest 之后构造——BaseController 构造时捕获当前 request
        $this->postRequest([
            'name' => '仅后台套餐', 'plan_type' => 'coding', 'price' => 66,
            'public_visible' => false, 'category' => 'month',
        ]);
        $created = $this->body((new \app\controller\dashboard\Plan(app()))->create())['data'];
        $this->assertFalse((bool) $created['public_visible']);

        // 公开目录不可见
        $list = $this->body($this->controller()->plans())['data']['list'];
        $this->assertNotContains('仅后台套餐', array_column($list, 'name'));

        // 改回公开后可见
        $this->postRequest([
            'name' => '仅后台套餐', 'plan_type' => 'coding', 'price' => 66,
            'public_visible' => true, 'category' => 'month',
        ]);
        (new \app\controller\dashboard\Plan(app()))->update($created['id']);
        $list = $this->body($this->controller()->plans())['data']['list'];
        $this->assertContains('仅后台套餐', array_column($list, 'name'));
    }

    public function testOverviewCountsAndMinMultiplier(): void
    {
        $modelA = $this->seedModelChain('model-a');
        $this->seedModelChain('model-b');
        $this->seedUserRule(['model_id' => $modelA, 'multiplier' => 0.3]);

        $body = $this->body($this->controller()->overview());

        $this->assertSame(2, $body['data']['models']);
        $this->assertSame(2, $body['data']['providers']);
        $this->assertSame(0.3, $body['data']['min_multiplier']);
    }
}
