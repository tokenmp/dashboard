<?php
declare(strict_types=1);

namespace tests\integration;

use PHPUnit\Framework\TestCase;
use think\facade\Db;
use think\Request;

/**
 * 集成测试基类。
 *
 * 隔离策略:每个测试方法 setUp 时 TRUNCATE 涉及的表(干净起点),测试自行 seed。
 * DB 不可达时整类跳过(本地能跑、CI 无 PG 不报红)。
 *
 * seed 助手覆盖 plans / user_plans / usage_ledger / quota_reservations / redeem_codes。
 */
abstract class IntegrationTestCase extends TestCase
{
    /** 每个测试前置清空的核心表(CASCADE 处理外键依赖)。 */
    private const TRUNCATE_TABLES = [
        'redeem_code_redemptions', 'redeem_codes',
        'quota_reservations', 'usage_ledger',
        'user_plans', 'plans',
        'request_logs', 'users',
    ];

    private bool $pgAvailable = false;

    protected function setUp(): void
    {
        try {
            Db::connect('pgsql')->query('SELECT 1');
            $this->pgAvailable = true;
            $this->truncate();
        } catch (\Throwable $e) {
            $this->markTestSkipped('PG 测试库不可达,跳过集成测试: ' . $e->getMessage());
        }
    }

    protected function tearDown(): void
    {
        if ($this->pgAvailable) {
            $this->truncate();
        }
        // 清掉容器里中间件挂的 auth/user,避免跨测试类泄漏
        foreach (['user', 'auth'] as $key) {
            try {
                app()->delete($key);
            } catch (\Throwable) {
                // 未绑定时忽略
            }
        }
    }

    private function truncate(): void
    {
        $list = implode(', ', self::TRUNCATE_TABLES);
        Db::connect('pgsql')->execute("TRUNCATE TABLE {$list} RESTART IDENTITY CASCADE");
    }

    /* ------------------------------ helpers ------------------------------ */

    protected function conn()
    {
        return Db::connect('pgsql');
    }

    /** 执行参数化查询并返回行数组(assoc)。 */
    protected function rows(string $sql, array $bind = []): array
    {
        return $this->conn()->query($sql, $bind);
    }

    /* ----------------------- 控制器测试助手 ----------------------- */

    /**
     * 构造带 POST 数据的 request 并绑定为 app 的当前 request。
     * 之后 `new SomeController(app())` 即可读到该 POST。
     * 返回该 request,供需要时进一步定制(如 header、ip)。
     */
    protected function postRequest(array $post): Request
    {
        $req = (new Request())->withPost($post);
        app()->instance('request', $req);
        return $req;
    }

    /** 同 postRequest,但用于 GET 查询参数。 */
    protected function getRequest(array $get): Request
    {
        $req = (new Request())->withGet($get);
        app()->instance('request', $req);
        return $req;
    }

    /** 取控制器返回的 Json 响应体数组 {code,message,data}。 */
    protected function body($response): array
    {
        return $response->getData();
    }

    /** 取控制器返回的 Json 响应 HTTP 状态码。 */
    protected function httpCode($response): int
    {
        return $response->getCode();
    }

    protected function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }

    /**
     * 建一个最小用户(幂等:ON CONFLICT DO NOTHING)。
     * seedUserPlan / seedLedger / seedReservation 会自动调用它,确保外键满足。
     */
    protected function seedUser(string $id, array $o = []): void
    {
        $row = [
            'id'                => $id,
            'email'             => $o['email'] ?? ('u-' . substr($id, 0, 8) . '@test.local'),
            'password_hash'     => $o['password_hash'] ?? '$2y$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUV1234567890ab',
            'role'              => $o['role'] ?? 'user',
            'status'            => $o['status'] ?? 'active',
            'preferred_billing' => $o['preferred_billing'] ?? 'token',
            'fallback_enabled'  => (int) ($o['fallback_enabled'] ?? false),
            'token_version'     => $o['token_version'] ?? 0,
        ];
        $cols = implode(', ', array_map(fn($c) => "\"{$c}\"", array_keys($row)));
        $ph   = implode(', ', array_fill(0, count($row), '?'));
        $this->conn()->execute(
            "INSERT INTO \"users\" ({$cols}) VALUES ({$ph}) ON CONFLICT (id) DO NOTHING",
            array_values($row)
        );
    }

    /** 建一个 plan(默认 active)。返回 plan id。 */
    protected function seedPlan(array $o = []): string
    {
        $id   = $o['id'] ?? $this->uuid();
        $type = $o['plan_type'] ?? 'token';
        $row  = [
            'id'                   => $id,
            'name'                 => 'plan-' . $type . '-' . substr($id, 0, 4),
            'plan_type'            => $type,
            'price'                => 0,
            'status'               => 'active',
            'token_limit'          => null,
            'monthly_limit'        => null,
            'weekly_limit'         => null,
            'hourly_5h_limit'      => null,
            'cycle_days'           => null,
            'default_duration_days'=> null,
            'total_limit'          => 0,
            'allowed_model_names'  => '[]',
        ];
        foreach ($o as $k => $v) {
            $row[$k] = $v;
        }
        $this->insertRow('plans', $row);
        return $id;
    }

    /** 建一个 user_plan(默认 active,激活时间=30 天前)。返回 user_plan id。 */
    protected function seedUserPlan(string $userId, string $planId, array $o = []): string
    {
        $this->seedUser($userId);
        $id  = $o['id'] ?? $this->uuid();
        $row = [
            'id'           => $id,
            'user_id'      => $userId,
            'plan_id'      => $planId,
            'plan_type'    => $o['plan_type'] ?? 'token',
            'status'       => $o['status'] ?? 'active',
            'activated_at' => $o['activated_at'] ?? (date('Y-m-d H:i:s', strtotime('-30 days'))),
            'expires_at'   => $o['expires_at'] ?? null,
        ];
        $this->insertRow('user_plans', $row);
        return $id;
    }

    /** 写一条 usage_ledger(默认 created_at=now)。返回 ledger id。 */
    protected function seedLedger(string $userId, array $o = []): string
    {
        $this->seedUser($userId);
        $id  = $o['id'] ?? $this->uuid();
        $row = [
            'id'            => $id,
            'user_id'       => $userId,
            'ledger_type'   => $o['ledger_type'] ?? 'charge',
            'billing_plan'  => $o['billing_plan'] ?? 'token',
            'token_delta'   => $o['token_delta'] ?? 0,
            'request_delta' => $o['request_delta'] ?? 0,
            'reason'        => $o['reason'] ?? 'test',
        ];
        if (isset($o['created_at'])) {
            $row['created_at'] = $o['created_at'];
        }
        $this->insertRow('usage_ledger', $row);
        return $id;
    }

    /** 写一条 quota_reservation(默认 status=reserved,过期=+1 小时)。返回 id。 */
    protected function seedReservation(string $userId, array $o = []): string
    {
        $this->seedUser($userId);
        $id  = $o['id'] ?? $this->uuid();
        $row = [
            'id'                => $id,
            'user_id'           => $userId,
            'billing_plan'      => $o['billing_plan'] ?? 'token',
            'status'            => 'reserved',
            'reserved_tokens'   => $o['reserved_tokens'] ?? 0,
            'reserved_requests' => $o['reserved_requests'] ?? 0,
            'expires_at'        => $o['expires_at'] ?? (date('Y-m-d H:i:s', strtotime('+1 hour'))),
        ];
        $this->insertRow('quota_reservations', $row);
        return $id;
    }

    /** 写一条 request_logs(默认 created_at=now,success=true)。返回 id。 */
    protected function seedRequestLog(string $userId, array $o = []): string
    {
        $this->seedUser($userId);
        $id  = $o['id'] ?? $this->uuid();
        $row = [
            'id'           => $id,
            'user_id'      => $userId,
            'success'      => (int) ($o['success'] ?? true), // boolean 强转 int(PDO emulate prepare)
            'total_tokens' => $o['total_tokens'] ?? 0,
        ];
        if (isset($o['created_at'])) {
            $row['created_at'] = $o['created_at'];
        }
        $this->insertRow('request_logs', $row);
        return $id;
    }

    /** 建一个 redeem_code(默认 active,明文 code 用于兑换)。返回 code id。 */
    protected function seedRedeemCode(string $code, array $o = []): string
    {
        $id  = $o['id'] ?? $this->uuid();
        $row = [
            'id'              => $id,
            'name'            => $o['name'] ?? 'test-code',
            'code_hash'       => hash('sha256', $code),
            'token_amount'    => $o['token_amount'] ?? 0,
            'max_redemptions' => $o['max_redemptions'] ?? 100,
            'redeemed_count'  => $o['redeemed_count'] ?? 0,
            'status'          => 'active',
            'override_mode'   => $o['override_mode'] ?? 'replace',
            'starts_at'       => $o['starts_at'] ?? null,
            'expires_at'      => $o['expires_at'] ?? null,
            'duration_days'   => $o['duration_days'] ?? null,
            'coding_plan_id'  => $o['coding_plan_id'] ?? null,
            'token_plan_id'   => $o['token_plan_id'] ?? null,
            'image_plan_id'   => $o['image_plan_id'] ?? null,
            'code_prefix'     => null,
            'code_suffix'     => null,
        ];
        $this->insertRow('redeem_codes', $row);
        return $id;
    }

    /** 通用 insert:列名 → 占位符,值按序绑定。 */
    private function insertRow(string $table, array $row): void
    {
        $cols = implode(', ', array_map(fn($c) => "\"{$c}\"", array_keys($row)));
        $ph   = implode(', ', array_fill(0, count($row), '?'));
        $this->conn()->execute(
            "INSERT INTO \"{$table}\" ({$cols}) VALUES ({$ph})",
            array_values($row)
        );
    }

    /** 取 summary() 结果里指定 billingPlan 的 item,找不到返回 null。 */
    protected function findItem(array $items, string $billingPlan): ?array
    {
        foreach ($items as $it) {
            if (($it['billingPlan'] ?? null) === $billingPlan) {
                return $it;
            }
        }
        return null;
    }
}
