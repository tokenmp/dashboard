<?php
declare(strict_types=1);

namespace tests\integration;

use app\controller\dashboard\Upstream;
use think\facade\Db;

final class ProviderThinkingTest extends IntegrationTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->conn()->execute('TRUNCATE TABLE provider_endpoints, upstream_keys, providers RESTART IDENTITY CASCADE');
    }

    public function testProvidersListReturnsThinking(): void
    {
        $this->conn()->execute(
            "insert into providers (name, base_url, thinking_config) values ('prov-a', 'http://a', ?::jsonb)",
            [json_encode(['supported_efforts' => ['low', 'medium'], 'default_effort' => 'low'])]
        );
        $this->getRequest(['page' => 1, 'size' => 20]);
        $body = $this->body((new Upstream(app()))->providers());
        $item = $body['data']['list'][0] ?? null;
        $this->assertNotNull($item);
        $this->assertSame('low', $item['thinking']['default_effort'] ?? null);
    }
}
