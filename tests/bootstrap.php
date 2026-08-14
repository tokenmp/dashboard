<?php
declare(strict_types=1);

/**
 * PHPUnit 测试引导。
 *
 * 职责:
 *  1. 加载 composer autoload;
 *  2. 注入测试用环境变量(不依赖项目 .env,避免污染、保证可复现);
 *  3. 初始化 ThinkPHP App,让 think\facade\Env / Cache / Db 可用。
 *
 * ⚠️ 顺序要点:env 必须在 initialize() 之前注入——config/database.php 在
 *    initialize() 期间读取 env('PG_HOST' ...) 并缓存连接参数,晚于此时注入无效。
 *
 * 注入策略:
 *  - 走 think\facade\Env::get / env() 的服务(Jwt、SecretCrypto、database 配置):
 *    $app->env->set() 写入 Env::data,优先级最高,绕开「fallback 查 getenv('PHP_'.NAME)」怪癖;
 *  - 走原生 getenv() 的服务(ApiKeyHasher::hash):用 putenv() 注入进程环境变量。
 */

require __DIR__ . '/../vendor/autoload.php';

$app = new \think\App();

// ---- 必须在 initialize() 之前注入 ----
$app->env->set([
    'JWT_SECRET'          => 'phpunit-test-jwt-secret-not-for-production',
    'JWT_EXPIRE'          => '3600',
    'JWT_PREFIX'          => 'Bearer',
    'AUTH_KEY_TTL'        => '300',
    'AUTH_KEY_RATE_LIMIT' => '20',
    // 集成测试用 PG 连接(默认指向本地 executor-test-pg 容器里的独立库;
    // 可用 TEST_PG_* 环境变量覆盖;不可达时集成测试会自动跳过)
    'PG_HOST'             => getenv('TEST_PG_HOST') ?: '127.0.0.1',
    'PG_PORT'             => getenv('TEST_PG_PORT') ?: '5433',
    'PG_DB'               => getenv('TEST_PG_DB') ?: 'tokenmp_test',
    'PG_USER'             => getenv('TEST_PG_USER') ?: 'postgres',
    'PG_PASS'             => getenv('TEST_PG_PASS') ?: 'test123',
    'PG_CHARSET'          => 'utf8',
]);

$app->initialize();

// ---- 原生 getenv() 用(ApiKeyHasher)----
putenv('API_KEY_PEPPER=phpunit-test-pepper');
