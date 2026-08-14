<?php
declare(strict_types=1);

namespace tests\integration;

use app\controller\dashboard\Model;

/**
 * 平台模型 /v1/models 可见性诊断集成测试。
 *
 * 覆盖 Model::list() 附带的 v1_visible / v1_issues 字段——
 * 按 executor ListExecutorModels 的 JOIN 链（模型→映射→Key→供应商→端点）
 * 逐环验证缺一不可的检测提示。
 */
final class DashboardModelVisibilityTest extends IntegrationTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // 本测试专属表(基类 TRUNCATE 列表未覆盖)
        $this->conn()->execute(
            'TRUNCATE TABLE upstream_route_group_memberships, upstream_model_mappings,'
            . ' provider_endpoints, upstream_keys, providers, models, route_groups RESTART IDENTITY CASCADE'
        );
    }

    public function testFullChainActiveModelIsVisible(): void
    {
        $mid = $this->seedVisibilityChain();

        $body = $this->body((new Model(app()))->list());
        $item = $this->findModel($body, $mid);

        $this->assertTrue($item['v1_visible']);
        $this->assertSame([], $item['v1_issues']);
    }

    public function testMissingEndpointReportsProviderName(): void
    {
        // 链路完整但不建 provider_endpoints —— 即本次线上 deepseek 的实际情况
        $mid = $this->seedVisibilityChain(['skip_endpoint' => true]);

        $body = $this->body((new Model(app()))->list());
        $item = $this->findModel($body, $mid);

        $this->assertFalse($item['v1_visible']);
        $this->assertCount(1, $item['v1_issues']);
        $this->assertStringContainsString('供应商缺少可用的活跃端点', $item['v1_issues'][0]);
        $this->assertStringContainsString('prov-a', $item['v1_issues'][0]);
    }

    public function testDisabledModelReported(): void
    {
        $mid = $this->seedVisibilityChain(['model_status' => 'disabled']);

        $body = $this->body((new Model(app()))->list());
        $item = $this->findModel($body, $mid);

        $this->assertFalse($item['v1_visible']);
        $this->assertSame('模型未启用（status 非 active）', $item['v1_issues'][0]);
    }

    public function testAllMappingsDisabledReported(): void
    {
        $mid = $this->seedVisibilityChain(['mapping_status' => 'disabled']);

        $body = $this->body((new Model(app()))->list());
        $item = $this->findModel($body, $mid);

        $this->assertFalse($item['v1_visible']);
        $this->assertSame('所有上游映射均被禁用', $item['v1_issues'][0]);
    }

    public function testDisabledUpstreamKeyReported(): void
    {
        $mid = $this->seedVisibilityChain(['key_status' => 'disabled']);

        $body = $this->body((new Model(app()))->list());
        $item = $this->findModel($body, $mid);

        $this->assertFalse($item['v1_visible']);
        $this->assertStringContainsString('上游 Key 均不可用', $item['v1_issues'][0]);
    }

    public function testDisabledProviderReported(): void
    {
        $mid = $this->seedVisibilityChain(['provider_status' => 'disabled']);

        $body = $this->body((new Model(app()))->list());
        $item = $this->findModel($body, $mid);

        $this->assertFalse($item['v1_visible']);
        $this->assertSame('上游供应商被禁用', $item['v1_issues'][0]);
    }

    public function testNoMappingsReported(): void
    {
        $mid = $this->seedVisibilityChain(['skip_mapping' => true]);

        $body = $this->body((new Model(app()))->list());
        $item = $this->findModel($body, $mid);

        $this->assertFalse($item['v1_visible']);
        $this->assertSame('尚未配置任何上游映射', $item['v1_issues'][0]);
    }

    public function testMappingContextWindowPersisted(): void
    {
        // 映射级 context_window_tokens:仅配置与回读,路由过滤逻辑后续实现
        $mid = $this->seedVisibilityChain(['skip_mapping' => true]);
        $keyId = $this->rows("select id from upstream_keys limit 1")[0]['id'];

        $this->postRequest([
            'upstream_key_id'       => $keyId,
            'upstream_model_name'   => 'upstream-x',
            'max_tokens'            => '8000',
            'context_window_tokens' => '120000',
            'status'                => 'active',
        ]);
        $resp = (new Model(app()))->createMapping($mid);
        $mapId = $this->body($resp)['data']['id'];

        $rows = $this->rows("select context_window_tokens, max_tokens from upstream_model_mappings where id = ?", [$mapId]);
        $this->assertSame(120000, (int) $rows[0]['context_window_tokens']);
        $this->assertSame(8000, (int) $rows[0]['max_tokens']);

        // mappings() 接口透出该字段
        $this->getRequest([]);
        $list = $this->body((new Model(app()))->mappings($mid));
        $found = null;
        foreach ($list['data'] as $m) {
            if ($m['id'] === $mapId) {
                $found = $m;
            }
        }
        $this->assertNotNull($found);
        $this->assertSame(120000, $found['context_window_tokens']);
    }

    /* ------------------------------ helpers ------------------------------ */

    /**
     * 建一条完整可见性链:models → upstream_model_mappings → upstream_keys → providers
     * (→ provider_endpoints 仅当 with_endpoint=true)。
     * 返回 model id。$o 可覆写各环节 status 或跳过某一环。
     */
    private function seedVisibilityChain(array $o = []): string
    {
        $withEndpoint = !($o['skip_endpoint'] ?? false);
        $providerId = $this->uuid();
        $this->conn()->execute(
            'INSERT INTO providers (id, name, base_url, status) VALUES (?,?,?,?)',
            [$providerId, 'prov-a', 'https://example.test', $o['provider_status'] ?? 'active']
        );
        $keyId = $this->uuid();
        $this->conn()->execute(
            "INSERT INTO upstream_keys (id, provider_id, name, encrypted_key, status)"
            . " VALUES (?,?,?,?,?)",
            [$keyId, $providerId, 'key-a', 'enc-placeholder', $o['key_status'] ?? 'active']
        );
        if ($withEndpoint) {
            $this->conn()->execute(
                "INSERT INTO provider_endpoints (id, provider_id, protocol, path, status)"
                . " VALUES (?,?,?,?,?)",
                [$this->uuid(), $providerId, 'openai_chat', '/v1/chat/completions', $o['endpoint_status'] ?? 'active']
            );
        }
        $modelId = $this->uuid();
        $this->conn()->execute(
            "INSERT INTO models (id, name, status) VALUES (?,?,?)",
            [$modelId, 'model-' . substr($modelId, 0, 8), $o['model_status'] ?? 'active']
        );
        if (!($o['skip_mapping'] ?? false)) {
            $this->conn()->execute(
                "INSERT INTO upstream_model_mappings (id, upstream_key_id, model_id, status)"
                . " VALUES (?,?,?,?)",
                [$this->uuid(), $keyId, $modelId, $o['mapping_status'] ?? 'active']
            );
        }
        return $modelId;
    }

    /** 从 list() 响应里按 id 找模型条目。 */
    private function findModel(array $body, string $id): array
    {
        $data = $body['data']['list'] ?? $body['data'] ?? [];
        foreach ($data as $item) {
            if (($item['id'] ?? '') === $id) {
                return $item;
            }
        }
        $this->fail("list 响应中未找到模型 {$id}");
    }
}
