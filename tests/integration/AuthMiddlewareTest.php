<?php
declare(strict_types=1);

namespace tests\integration;

use app\middleware\Auth;
use app\service\Jwt;
use think\exception\HttpException;
use think\Request;

/**
 * Auth(JWT)鉴权中间件集成测试。
 *
 * 覆盖:token 解析、JWT 校验、用户加载、status 校验、token_version 校验、容器绑定。
 * 需 DB(User::find),故为集成测试。
 */
final class AuthMiddlewareTest extends IntegrationTestCase
{
    protected function tearDown(): void
    {
        // 中间件会把 auth/user 挂到容器,清掉避免跨用例污染
        app()->instance('auth', null);
        app()->instance('user', null);
    }

    private function requestWithHeader(string $headerValue): Request
    {
        return (new Request())->withHeader(['Authorization' => $headerValue]);
    }

    private function nextMarker(): \Closure
    {
        return static fn (Request $r) => 'NEXT';
    }

    /** 为已 seed 的用户签发 JWT(sub + token_version)。 */
    private function tokenFor(string $userId, int $tokenVersion): string
    {
        return Jwt::issue(['sub' => $userId, 'v' => $tokenVersion]);
    }

    /* ----------------------------- 成功路径 ----------------------------- */

    public function testValidTokenBindsAuthAndUserAndCallsNext(): void
    {
        $userId = $this->uuid();
        $this->seedUser($userId, ['role' => 'user', 'status' => 'active', 'token_version' => 0]);
        $token  = $this->tokenFor($userId, 0);

        $result = (new Auth())->handle($this->requestWithHeader('Bearer ' . $token), $this->nextMarker());

        $this->assertSame('NEXT', $result);

        $payload = app('auth');
        $user    = app('user');
        $this->assertSame($userId, $payload->sub);
        $this->assertSame($userId, (string) $user->id);
        $this->assertSame('active', $user->status);
    }

    /* ----------------------------- 401 分支 ----------------------------- */

    public function testMissingTokenRejected401(): void
    {
        $req = (new Request()); // 无 Authorization 头

        $this->expectException(HttpException::class);
        try {
            (new Auth())->handle($req, $this->nextMarker());
        } catch (HttpException $e) {
            $this->assertSame(401, $e->getStatusCode());
            throw $e;
        }
    }

    public function testMalformedHeaderRejected401(): void
    {
        // 不是 "Bearer xxx" 前缀
        $req = $this->requestWithHeader('Token abcdef');

        $this->expectException(HttpException::class);
        try {
            (new Auth())->handle($req, $this->nextMarker());
        } catch (HttpException $e) {
            $this->assertSame(401, $e->getStatusCode());
            throw $e;
        }
    }

    public function testInvalidTokenRejected401(): void
    {
        $req = $this->requestWithHeader('Bearer not-a-real-jwt');

        $this->expectException(HttpException::class);
        try {
            (new Auth())->handle($req, $this->nextMarker());
        } catch (HttpException $e) {
            $this->assertSame(401, $e->getStatusCode());
            throw $e;
        }
    }

    public function testDisabledUserRejected401(): void
    {
        $userId = $this->uuid();
        $this->seedUser($userId, ['status' => 'disabled', 'token_version' => 0]);
        $token  = $this->tokenFor($userId, 0);

        $this->expectException(HttpException::class);
        try {
            (new Auth())->handle($this->requestWithHeader('Bearer ' . $token), $this->nextMarker());
        } catch (HttpException $e) {
            $this->assertSame(401, $e->getStatusCode());
            throw $e;
        }
    }

    public function testTokenVersionMismatchRejected401(): void
    {
        // 改密码/状态/角色后 token_version 自增,旧 token 立即失效
        $userId = $this->uuid();
        $this->seedUser($userId, ['status' => 'active', 'token_version' => 2]);
        $staleToken = $this->tokenFor($userId, 1); // 旧版本

        $this->expectException(HttpException::class);
        try {
            (new Auth())->handle($this->requestWithHeader('Bearer ' . $staleToken), $this->nextMarker());
        } catch (HttpException $e) {
            $this->assertSame(401, $e->getStatusCode());
            throw $e;
        }
    }

    public function testUnknownUserSubjectRejected401(): void
    {
        // token 合法但 sub 指向不存在的用户(已被删除)
        $ghostToken = $this->tokenFor($this->uuid(), 0);

        $this->expectException(HttpException::class);
        try {
            (new Auth())->handle($this->requestWithHeader('Bearer ' . $ghostToken), $this->nextMarker());
        } catch (HttpException $e) {
            $this->assertSame(401, $e->getStatusCode());
            throw $e;
        }
    }
}
