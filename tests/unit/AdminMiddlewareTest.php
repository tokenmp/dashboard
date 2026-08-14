<?php
declare(strict_types=1);

namespace tests\unit;

use app\model\User;
use app\middleware\Admin;
use PHPUnit\Framework\TestCase;
use think\exception\HttpException;
use think\Request;

/**
 * Admin 鉴权中间件单测。
 *
 * 依赖 Auth 已把 app('user') 注入容器;本中间件只校验 role==='admin',非 admin → 403。
 * 用内存 User 构造,不触 DB。
 */
final class AdminMiddlewareTest extends TestCase
{

    protected function setUp(): void
    {
        // ThinkPHP User 模型实例化会触发表结构内省(连库);PG 不可达时跳过,CI 无 PG 不报红
        try {
            \think\facade\Db::connect('pgsql')->query('SELECT 1');
        } catch (\Throwable) {
            $this->markTestSkipped('PG 测试库不可达,跳过(依赖 User 模型实例化)');
        }
    }
    private function nextMarker(): \Closure
    {
        return static fn (Request $r) => 'NEXT';
    }

    private function bindUser(?string $role): void
    {
        app()->instance('user', $role === null ? null : new User(['role' => $role]));
    }

    protected function tearDown(): void
    {
        app()->instance('user', null);
    }

    public function testAdminPassesThrough(): void
    {
        $this->bindUser('admin');
        $mw = new Admin();

        $result = $mw->handle(app('request'), $this->nextMarker());

        $this->assertSame('NEXT', $result);
    }

    public function testNonAdminRejectedWith403(): void
    {
        $this->bindUser('user');
        $mw = new Admin();

        $this->expectException(HttpException::class);
        try {
            $mw->handle(app('request'), $this->nextMarker());
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
            throw $e;
        }
    }

    public function testMissingUserRejectedWith403(): void
    {
        // Auth 未执行(app('user') 根本未绑定)→ 防御性兜底应干净地 403,而非抛 ClassNotFoundException
        app()->delete('user');
        $mw = new Admin();

        $this->expectException(HttpException::class);
        try {
            $mw->handle(app('request'), $this->nextMarker());
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
            throw $e;
        }
    }
}
