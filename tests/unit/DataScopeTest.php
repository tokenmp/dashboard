<?php
declare(strict_types=1);

namespace tests\unit;

use app\model\User;
use app\service\DataScope;
use PHPUnit\Framework\TestCase;

/**
 * DataScope 单测:角色数据隔离的分支逻辑。
 *
 * 用内存 User + 记录型 fake query 验证:
 *  - admin(dashboard):无 filter 不加 where;有 filter 按 filter 筛
 *  - user:强制绑定自身,忽略前端 filter(防越权)
 *  - forSelf(panel):无论角色都只看自己
 */
final class DataScopeTest extends TestCase
{
    /** 记录 where() 调用的 fake query(scope 只用到 ->where())。 */
    private function recordingQuery(): object
    {
        return new class {
            /** @var array<int,array> */
            public array $wheres = [];

            /** @return $this */
            public function where($column, $value)
            {
                $this->wheres[] = [$column, $value];
                return $this;
            }
        };
    }

    public function testAdminSeesAllWhenNoFilter(): void
    {
        $admin = new User(['id' => 'admin-1', 'role' => 'admin']);
        $ctx   = DataScope::forUser($admin);
        $q     = $this->recordingQuery();

        $this->assertTrue($ctx->isAdmin());
        $ret = $ctx->scope($q, 'user_id', null);

        $this->assertSame($q, $ret);       // 原样返回
        $this->assertSame([], $q->wheres); // admin 无 filter → 不加任何 where
    }

    public function testAdminFiltersByRequestedUserId(): void
    {
        $admin = new User(['id' => 'admin-1', 'role' => 'admin']);
        $ctx   = DataScope::forUser($admin);
        $q     = $this->recordingQuery();

        $ctx->scope($q, 'user_id', 'target-user-9');

        $this->assertSame([['user_id', 'target-user-9']], $q->wheres);
    }

    public function testAdminEmptyFilterStringTreatedAsNoFilter(): void
    {
        $admin = new User(['id' => 'admin-1', 'role' => 'admin']);
        $ctx   = DataScope::forUser($admin);
        $q     = $this->recordingQuery();

        $ctx->scope($q, 'user_id', '');

        $this->assertSame([], $q->wheres);
    }

    public function testUserIsScopedToSelfAndIgnoresFrontendFilter(): void
    {
        // 防越权:普通用户传任意 userId 都被忽略,强制绑定自身
        $user = new User(['id' => 'u-self', 'role' => 'user']);
        $ctx  = DataScope::forUser($user);
        $q    = $this->recordingQuery();

        $this->assertFalse($ctx->isAdmin());
        $ctx->scope($q, 'user_id', 'someone-else');

        $this->assertSame([['user_id', 'u-self']], $q->wheres);
    }

    public function testForSelfForcesSelfScopeEvenForAdmin(): void
    {
        // panel 命名空间:admin 也以普通用户身份访问,只看自己
        $admin = new User(['id' => 'admin-1', 'role' => 'admin']);
        $ctx   = DataScope::forSelf($admin);
        $q     = $this->recordingQuery();

        $this->assertFalse($ctx->isAdmin());
        $ctx->scope($q, 'user_id');

        $this->assertSame([['user_id', 'admin-1']], $q->wheres);
    }

    public function testCustomColumnUsedInWhere(): void
    {
        $user = new User(['id' => 'u-7', 'role' => 'user']);
        $ctx  = DataScope::forUser($user);
        $q    = $this->recordingQuery();

        $ctx->scope($q, 'owner_id');

        $this->assertSame([['owner_id', 'u-7']], $q->wheres);
    }

    public function testUserIdAccessor(): void
    {
        $user = new User(['id' => 'u-xyz', 'role' => 'user']);
        $ctx  = DataScope::forUser($user);

        $this->assertSame('u-xyz', $ctx->userId());
        $this->assertSame($user, $ctx->user());
    }
}
