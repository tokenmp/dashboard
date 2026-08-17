<?php
declare(strict_types=1);

namespace tests\integration;

use app\controller\panel\Upstream as PanelUpstream;
use app\service\UpstreamKeyService;
use app\model\User as UserModel;
use think\exception\HttpException;

/**
 * panel Upstream 自有 Key 写路径集成测试。
 *
 * 覆盖：创建（模板克隆映射+路由组）、跨用户隔离、billing_mode 校验、数量上限、
 * 软删级联、增删模型映射、探测节流、密文 roundtrip。
 */
final class PanelUpstreamKeyControllerTest extends IntegrationTestCase
{
    private const CATALOG_TABLES = 'upstream_key_verifications, upstream_route_group_memberships, upstream_model_mappings, marketplace_listings, upstream_keys, provider_endpoints, providers, models, route_groups, price_multiplier_rules';

    private bool $truncatedCatalog = false;

    protected function setUp(): void
    {
        parent::setUp();
        try {
            $this->conn()->execute('TRUNCATE TABLE ' . self::CATALOG_TABLES . ' RESTART IDENTITY CASCADE');
            $this->truncatedCatalog = true;
        } catch (\Throwable $e) {
            $this->markTestSkipped('目录表不可清空,跳过: ' . $e->getMessage());
        }
    }

    protected function tearDown(): void
    {
        if ($this->truncatedCatalog) {
            try {
                $this->conn()->execute('TRUNCATE TABLE ' . self::CATALOG_TABLES . ' RESTART IDENTITY CASCADE');
            } catch (\Throwable) {
                // 忽略清理失败
            }
        }
        parent::tearDown();
    }

    /* ------------------------------ seed 助手 ------------------------------ */

    /** 建目录链：provider + endpoint + model + default 组 + 平台 key + 模板 mapping。返回相关 id。 */
    private function seedCatalog(string $modelUpstreamName = 'up-gpt-4o'): array
    {
        $c = $this->conn();
        $providerId = $this->uuid();
        $endpointId = $this->uuid();
        $modelId = $this->uuid();
        $platformKeyId = $this->uuid();
        $mappingId = $this->uuid();
        $groupId = $this->uuid();

        $c->execute("insert into providers (id, name, display_name, base_url, status) values (?, 'prov-test', '测试供应商', 'http://127.0.0.1:9', 'active')", [$providerId]);
        $c->execute("insert into provider_endpoints (id, provider_id, protocol, path, kind, status, created_at) values (?, ?, 'openai_chat', '/v1/chat/completions', 'llm.chat', 'active', NOW())", [$endpointId, $providerId]);
        $c->execute("insert into models (id, name, display_name, status) values (?, 'gpt-4o', 'GPT-4o', 'active')", [$modelId]);
        $c->execute("insert into route_groups (id, name, status) values (?, 'default', 'active')", [$groupId]);
        $c->execute(
            "insert into upstream_keys (id, provider_id, name, key_prefix, key_suffix, encrypted_key, encryption_version, status, source_type, billing_mode, created_at, updated_at) "
            . "values (?, ?, 'platform-key', 'sk-a', '-0001', ?, 1, 'active', 'platform', 'plan', NOW(), NOW())",
            [$platformKeyId, $providerId, UpstreamKeyService::encryptKey('platform-secret-key-0001')]
        );
        $c->execute(
            "insert into upstream_model_mappings (id, upstream_key_id, model_id, upstream_model_name, input_price_per_token, output_price_per_token, max_tokens, status, provider_endpoint_id, created_at) "
            . "values (?, ?, ?, ?, 0.000001, 0.000002, 4096, 'active', ?, NOW())",
            [$mappingId, $platformKeyId, $modelId, $modelUpstreamName, $endpointId]
        );
        $c->execute("insert into upstream_route_group_memberships (id, upstream_model_mapping_id, route_group_id, status) values (?, ?, ?, 'active')", [$this->uuid(), $mappingId, $groupId]);

        return compact('providerId', 'endpointId', 'modelId', 'platformKeyId', 'mappingId', 'groupId');
    }

    private function actingAs(string $userId): void
    {
        app()->instance('user', new UserModel(['id' => $userId, 'role' => 'user']));
    }

    private function controller(): PanelUpstream
    {
        return new PanelUpstream(app());
    }

    /* ------------------------------ 用例 ------------------------------ */

    public function testCreateOptionsListsProvidersWithTemplates(): void
    {
        $cat = $this->seedCatalog();
        $user = $this->uuid();
        $this->actingAs($user);

        $this->getRequest([]);
        $data = $this->body($this->controller()->createOptions())['data'];
        $this->assertSame($cat['providerId'], $data['providers'][0]['id']);
        $this->assertSame(1, (int) $data['providers'][0]['model_count']);

        $this->getRequest(['provider_id' => $cat['providerId']]);
        $data = $this->body($this->controller()->createOptions())['data'];
        $this->assertCount(1, $data['models']);
        $this->assertSame('gpt-4o', $data['models'][0]['name']);
        $this->assertSame('up-gpt-4o', $data['models'][0]['upstream_model_name']);
    }

    public function testCreateKeyClonesTemplateMappings(): void
    {
        $cat = $this->seedCatalog();
        $user = $this->uuid();
        $this->seedUser($user);
        $this->actingAs($user);

        $this->postRequest([
            'provider_id' => $cat['providerId'],
            'name' => '我的 OpenAI key',
            'key' => 'sk-user-own-abcdefgh',
            'billing_mode' => 'free',
            'model_ids' => [$cat['modelId']],
        ]);
        $keyId = $this->body($this->controller()->createKey())['data']['id'];

        $key = $this->rows("select * from upstream_keys where id = ?", [$keyId])[0];
        $this->assertSame('user', $key['source_type']);
        $this->assertSame($user, $key['owner_user_id']);
        $this->assertSame('private', $key['visibility']);
        $this->assertSame('free', $key['billing_mode']);
        $this->assertSame('active', $key['status']);
        $this->assertSame('sk-u', $key['key_prefix']);
        $this->assertSame('efgh', $key['key_suffix']);
        // 密文可解回原文（与 executor 同格式）
        $this->assertSame('sk-user-own-abcdefgh', UpstreamKeyService::decryptKey($key['encrypted_key']));

        // 映射克隆：同 upstream_model_name / 端点 / 定价
        $m = $this->rows("select * from upstream_model_mappings where upstream_key_id = ? and status <> 'deleted'", [$keyId]);
        $this->assertCount(1, $m);
        $this->assertSame('up-gpt-4o', $m[0]['upstream_model_name']);
        $this->assertSame($cat['endpointId'], $m[0]['provider_endpoint_id']);
        $this->assertEqualsWithDelta(0.000001, (float) $m[0]['input_price_per_token'], 1e-12);

        // 路由组：克隆模板归属（default）
        $g = $this->rows(
            "select rg.name from upstream_route_group_memberships urgm join route_groups rg on rg.id = urgm.route_group_id"
            . " where urgm.upstream_model_mapping_id = ? and urgm.status <> 'deleted'",
            [$m[0]['id']]
        );
        $this->assertSame([['name' => 'default']], $g);
    }

    public function testCrossUserCannotTouchOthersKeys(): void
    {
        $cat = $this->seedCatalog();
        $alice = $this->uuid();
        $bob = $this->uuid();
        $this->seedUser($alice);
        $this->seedUser($bob);

        $this->actingAs($alice);
        $this->postRequest([
            'provider_id' => $cat['providerId'], 'name' => 'alice key', 'key' => 'sk-alice-own-1234',
            'billing_mode' => 'plan', 'model_ids' => [$cat['modelId']],
        ]);
        $keyId = $this->body($this->controller()->createKey())['data']['id'];

        // Bob 对 Alice 的 key 一律 404
        $this->actingAs($bob);
        $this->postRequest(['status' => 'disabled']);
        try {
            $this->controller()->updateKeyStatus($keyId);
            $this->fail('应抛 404');
        } catch (HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
        }
        try {
            $this->controller()->deleteKey($keyId);
            $this->fail('应抛 404');
        } catch (HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
        }
        $row = $this->rows("select status from upstream_keys where id = ?", [$keyId]);
        $this->assertSame('active', $row[0]['status'], 'Bob 不应能改动 Alice 的 key');
    }

    public function testCreateKeyValidatesBillingModeAndQuota(): void
    {
        $cat = $this->seedCatalog();
        $user = $this->uuid();
        $this->seedUser($user);
        $this->actingAs($user);

        $this->postRequest([
            'provider_id' => $cat['providerId'], 'name' => 'x', 'key' => 'sk-user-own-1234',
            'billing_mode' => 'discount', 'model_ids' => [$cat['modelId']],
        ]);
        try {
            $this->controller()->createKey();
            $this->fail('billing_mode=discount 应 400');
        } catch (HttpException $e) {
            $this->assertSame(400, $e->getStatusCode());
        }

        // 数量上限：默认插入 MAX_OWN_KEYS(10) 个后拒绝
        $this->postRequest([
            'provider_id' => $cat['providerId'], 'name' => 'k', 'key' => 'sk-user-own-1234',
            'billing_mode' => 'plan', 'model_ids' => [$cat['modelId']],
        ]);
        for ($i = 0; $i < 10; $i++) {
            $this->controller()->createKey();
        }
        try {
            $this->controller()->createKey();
            $this->fail('第 11 个 key 应 400');
        } catch (HttpException $e) {
            $this->assertSame(400, $e->getStatusCode());
        }
    }

    public function testDeleteKeyCascadesMappings(): void
    {
        $cat = $this->seedCatalog();
        $user = $this->uuid();
        $this->seedUser($user);
        $this->actingAs($user);
        $this->postRequest([
            'provider_id' => $cat['providerId'], 'name' => 'k', 'key' => 'sk-user-own-1234',
            'billing_mode' => 'free', 'model_ids' => [$cat['modelId']],
        ]);
        $keyId = $this->body($this->controller()->createKey())['data']['id'];

        $this->controller()->deleteKey($keyId);

        $key = $this->rows("select status from upstream_keys where id = ?", [$keyId])[0];
        $this->assertSame('deleted', $key['status']);
        $m = $this->rows("select status from upstream_model_mappings where upstream_key_id = ?", [$keyId]);
        $this->assertSame('deleted', $m[0]['status']);
    }

    public function testAddAndRemoveModelMappings(): void
    {
        $cat = $this->seedCatalog();
        // 第二个模型 + 模板
        $model2 = $this->uuid();
        $this->conn()->execute("insert into models (id, name, display_name, status) values (?, 'gpt-4o-mini', 'GPT-4o mini', 'active')", [$model2]);
        $this->conn()->execute(
            "insert into upstream_model_mappings (id, upstream_key_id, model_id, upstream_model_name, status, created_at) values (?, ?, ?, 'up-mini', 'active', NOW())",
            [$this->uuid(), $cat['platformKeyId'], $model2]
        );

        $user = $this->uuid();
        $this->seedUser($user);
        $this->actingAs($user);
        $this->postRequest([
            'provider_id' => $cat['providerId'], 'name' => 'k', 'key' => 'sk-user-own-1234',
            'billing_mode' => 'free', 'model_ids' => [$cat['modelId']],
        ]);
        $keyId = $this->body($this->controller()->createKey())['data']['id'];

        // 增加第二个模型
        $this->postRequest(['model_ids' => [$model2]]);
        $this->controller()->addModels($keyId);
        $count = $this->rows("select count(*) as c from upstream_model_mappings where upstream_key_id = ? and status <> 'deleted'", [$keyId])[0]['c'];
        $this->assertSame(2, (int) $count);

        // 移除一个
        $mapping = $this->rows("select id from upstream_model_mappings where upstream_key_id = ? and model_id = ? and status <> 'deleted'", [$keyId, $cat['modelId']])[0];
        $this->controller()->removeModel($keyId, $mapping['id']);
        $count = $this->rows("select count(*) as c from upstream_model_mappings where upstream_key_id = ? and status <> 'deleted'", [$keyId])[0]['c'];
        $this->assertSame(1, (int) $count);
    }

    public function testProbeIsThrottledAndRecordsVerification(): void
    {
        $cat = $this->seedCatalog();
        $user = $this->uuid();
        $this->seedUser($user);
        $this->actingAs($user);
        $this->postRequest([
            'provider_id' => $cat['providerId'], 'name' => 'k', 'key' => 'sk-user-own-1234',
            'billing_mode' => 'plan', 'model_ids' => [$cat['modelId']],
        ]);
        $keyId = $this->body($this->controller()->createKey())['data']['id'];

        // 第一次探测：上游 127.0.0.1:9 不可达 → failed(NETWORK)，但记录 verification
        $result = $this->body($this->controller()->probeKey($keyId))['data'];
        $this->assertSame('failed', $result['status']);
        $this->assertSame('NETWORK', $result['error_code']);
        $v = $this->rows("select count(*) as c from upstream_key_verifications where upstream_key_id = ?", [$keyId])[0]['c'];
        $this->assertSame(1, (int) $v);

        // 30s 内第二次 → 429
        try {
            $this->controller()->probeKey($keyId);
            $this->fail('应被节流 429');
        } catch (HttpException $e) {
            $this->assertSame(429, $e->getStatusCode());
        }
    }

    public function testUpdateKeyRotatesSecretAndBillingMode(): void
    {
        $cat = $this->seedCatalog();
        $user = $this->uuid();
        $this->seedUser($user);
        $this->actingAs($user);
        $this->postRequest([
            'provider_id' => $cat['providerId'], 'name' => 'k', 'key' => 'sk-user-own-1234',
            'billing_mode' => 'plan', 'model_ids' => [$cat['modelId']],
        ]);
        $keyId = $this->body($this->controller()->createKey())['data']['id'];

        $this->postRequest(['billing_mode' => 'free', 'key' => 'sk-rotated-987654']);
        $this->controller()->updateKey($keyId);

        $key = $this->rows("select billing_mode, encrypted_key from upstream_keys where id = ?", [$keyId])[0];
        $this->assertSame('free', $key['billing_mode']);
        $this->assertSame('sk-rotated-987654', UpstreamKeyService::decryptKey($key['encrypted_key']));
    }

    public function testUpdateKeySwitchesProviderAndRebuildsMappings(): void
    {
        $cat = $this->seedCatalog();
        // 第二个供应商 + 端点 + 模板（模型复用同一个）
        $provider2 = $this->uuid();
        $endpoint2 = $this->uuid();
        $platformKey2 = $this->uuid();
        $mapping2 = $this->uuid();
        $c = $this->conn();
        $c->execute("insert into providers (id, name, base_url, status) values (?, 'prov-two', 'http://127.0.0.1:9', 'active')", [$provider2]);
        $c->execute("insert into provider_endpoints (id, provider_id, protocol, path, kind, status, created_at) values (?, ?, 'openai_chat', '/v1/chat/completions', 'llm.chat', 'active', NOW())", [$endpoint2, $provider2]);
        $c->execute(
            "insert into upstream_keys (id, provider_id, name, key_prefix, key_suffix, encrypted_key, encryption_version, status, source_type, billing_mode, created_at, updated_at) "
            . "values (?, ?, 'platform-key-2', 'sk-b', '-0002', ?, 1, 'active', 'platform', 'plan', NOW(), NOW())",
            [$platformKey2, $provider2, UpstreamKeyService::encryptKey('platform-secret-key-0002')]
        );
        $c->execute(
            "insert into upstream_model_mappings (id, upstream_key_id, model_id, upstream_model_name, status, provider_endpoint_id, created_at) values (?, ?, ?, 'up-two-model', 'active', ?, NOW())",
            [$mapping2, $platformKey2, $cat['modelId'], $endpoint2]
        );

        $user = $this->uuid();
        $this->seedUser($user);
        $this->actingAs($user);
        $this->postRequest([
            'provider_id' => $cat['providerId'], 'name' => 'k', 'key' => 'sk-user-own-1234',
            'billing_mode' => 'plan', 'model_ids' => [$cat['modelId']],
        ]);
        $keyId = $this->body($this->controller()->createKey())['data']['id'];

        // 换供应商：必须带 model_ids
        $this->postRequest(['provider_id' => $provider2]);
        try {
            $this->controller()->updateKey($keyId);
            $this->fail('换供应商缺 model_ids 应 400');
        } catch (HttpException $e) {
            $this->assertSame(400, $e->getStatusCode());
        }

        $this->postRequest(['provider_id' => $provider2, 'model_ids' => [$cat['modelId']]]);
        $this->controller()->updateKey($keyId);

        $key = $this->rows("select provider_id, verified_at from upstream_keys where id = ?", [$keyId])[0];
        $this->assertSame($provider2, $key['provider_id']);
        $this->assertNull($key['verified_at'], '换供应商后探测结论应重置');
        // 旧映射软删，新映射按 provider2 模板克隆
        $active = $this->rows("select upstream_model_name, provider_endpoint_id from upstream_model_mappings where upstream_key_id = ? and status <> 'deleted'", [$keyId]);
        $this->assertCount(1, $active);
        $this->assertSame('up-two-model', $active[0]['upstream_model_name']);
        $this->assertSame($endpoint2, $active[0]['provider_endpoint_id']);
        $deleted = $this->rows("select count(*) as c from upstream_model_mappings where upstream_key_id = ? and status = 'deleted'", [$keyId])[0]['c'];
        $this->assertSame(1, (int) $deleted);
    }

    public function testUpdateKeyRejectsProviderWithoutTemplates(): void
    {
        $cat = $this->seedCatalog();
        // 无模板的供应商（active 但无平台 key 映射）
        $provider3 = $this->uuid();
        $this->conn()->execute("insert into providers (id, name, base_url, status) values (?, 'prov-empty', 'http://127.0.0.1:9', 'active')", [$provider3]);

        $user = $this->uuid();
        $this->seedUser($user);
        $this->actingAs($user);
        $this->postRequest([
            'provider_id' => $cat['providerId'], 'name' => 'k', 'key' => 'sk-user-own-1234',
            'billing_mode' => 'plan', 'model_ids' => [$cat['modelId']],
        ]);
        $keyId = $this->body($this->controller()->createKey())['data']['id'];

        $this->postRequest(['provider_id' => $provider3, 'model_ids' => [$cat['modelId']]]);
        try {
            $this->controller()->updateKey($keyId);
            $this->fail('目标供应商无模板应 400');
        } catch (HttpException $e) {
            $this->assertSame(400, $e->getStatusCode());
        }
    }
}
