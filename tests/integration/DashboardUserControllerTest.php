<?php
declare(strict_types=1);

namespace tests\integration;

use app\controller\dashboard\User as UserController;
use app\model\User as UserModel;
use think\exception\HttpException;

/**
 * dashboard User 控制器集成测试(管理员用户管理)。
 *
 * 代表性覆盖 CRUD、DataScope无关的全平台查询、自保护(不能锁死自己)、
 * token_version 自增(吊销旧 JWT)等安全相关行为。
 */
final class DashboardUserControllerTest extends IntegrationTestCase
{
    private function controller(): UserController
    {
        return new UserController(app());
    }

    /** 把当前操作者(admin)挂到容器,update() 用 app('user')->id 做自保护判定。 */
    private function actingAs(string $adminId): void
    {
        app()->instance('user', new UserModel(['id' => $adminId, 'role' => 'admin']));
    }

    /* ----------------------------- detail ----------------------------- */

    public function testDetailReturns404ForUnknownUser(): void
    {
        $this->expectException(HttpException::class);
        try {
            $this->controller()->detail($this->uuid());
        } catch (HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
            throw $e;
        }
    }

    public function testDetailReturnsUserAndQuota(): void
    {
        $userId = $this->uuid();
        $this->seedUser($userId, ['email' => 'detail@test.local', 'role' => 'user']);

        $body = $this->body($this->controller()->detail($userId));

        $this->assertSame(0, $body['code']);
        $this->assertSame($userId, $body['data']['user']['id']);
        $this->assertSame('detail@test.local', $body['data']['user']['email']);
        // 无套餐/流水时 quota 与 usage 为空
        $this->assertSame([], $body['data']['quota']);
        $this->assertSame([], $body['data']['usage']);
    }

    /* ----------------------------- list ----------------------------- */

    public function testListFiltersByRole(): void
    {
        $this->seedUser($this->uuid(), ['email' => 'a@test.local', 'role' => 'admin']);
        $this->seedUser($this->uuid(), ['email' => 'b@test.local', 'role' => 'user']);
        $this->seedUser($this->uuid(), ['email' => 'c@test.local', 'role' => 'user']);

        $this->getRequest(['role' => 'admin']);
        $data = $this->body($this->controller()->list())['data'];

        $this->assertSame(1, $data['total']);
        $this->assertCount(1, $data['list']);
        $this->assertSame('admin', $data['list'][0]['role']);
    }

    public function testListFiltersByKeyword(): void
    {
        $this->seedUser($this->uuid(), ['email' => 'findme@test.local', 'role' => 'user']);
        $this->seedUser($this->uuid(), ['email' => 'other@test.local', 'role' => 'user']);

        $this->getRequest(['keyword' => 'findme']);
        $data = $this->body($this->controller()->list())['data'];

        $this->assertSame(1, $data['total']);
        $this->assertSame('findme@test.local', $data['list'][0]['email']);
    }

    /* ----------------------------- create ----------------------------- */

    public function testCreateRejectsInvalidEmail(): void
    {
        $this->expectException(HttpException::class);
        try {
            $this->postRequest(['email' => 'not-an-email']);
            $this->controller()->create();
        } catch (HttpException $e) {
            $this->assertSame(400, $e->getStatusCode());
            throw $e;
        }
    }

    public function testCreateRejectsDuplicateEmail(): void
    {
        $this->seedUser($this->uuid(), ['email' => 'dup@test.local']);

        $this->expectException(HttpException::class);
        try {
            $this->postRequest(['email' => 'dup@test.local']);
            $this->controller()->create();
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
            throw $e;
        }
    }

    public function testCreateReturnsTempPasswordAndPersistsUser(): void
    {
        $this->postRequest(['email' => 'newuser@test.local', 'role' => 'admin']);
        $data = $this->body($this->controller()->create())['data'];

        $this->assertSame('newuser@test.local', $data['email']);
        $this->assertSame('admin', $data['role']);
        $this->assertNotEmpty($data['password']);      // 临时明文密码仅返回一次
        $this->assertSame(16, strlen($data['password']));

        // 真的落库了
        $row = $this->rows('SELECT email, role FROM users WHERE id = ?', [$data['id']]);
        $this->assertCount(1, $row);
        $this->assertSame('newuser@test.local', $row[0]['email']);
        $this->assertSame('admin', $row[0]['role']);
    }

    /* ----------------------------- update 自保护 + token_version ----------------------------- */

    public function testUpdateRejectsChangingOwnRole(): void
    {
        $me = $this->uuid();
        $this->seedUser($me, ['email' => 'me@test.local', 'role' => 'admin']);
        $this->actingAs($me);

        $this->expectException(HttpException::class);
        try {
            $this->postRequest(['role' => 'user']);
            $this->controller()->update($me);
        } catch (HttpException $e) {
            $this->assertSame(400, $e->getStatusCode());
            throw $e;
        }
    }

    public function testUpdateRejectsDisablingSelf(): void
    {
        $me = $this->uuid();
        $this->seedUser($me, ['email' => 'me@test.local', 'role' => 'admin', 'status' => 'active']);
        $this->actingAs($me);

        $this->expectException(HttpException::class);
        try {
            $this->postRequest(['status' => 'disabled']);
            $this->controller()->update($me);
        } catch (HttpException $e) {
            $this->assertSame(400, $e->getStatusCode());
            throw $e;
        }
    }

    public function testUpdateRoleChangeBumpsTokenVersion(): void
    {
        // 改角色 → token_version 自增,吊销该用户所有旧 JWT
        $target = $this->uuid();
        $admin  = $this->uuid();
        $this->seedUser($target, ['email' => 'target@test.local', 'role' => 'user', 'token_version' => 1]);
        $this->seedUser($admin, ['email' => 'admin@test.local', 'role' => 'admin']);
        $this->actingAs($admin);

        $this->postRequest(['role' => 'admin']);
        $data = $this->body($this->controller()->update($target))['data'];

        $this->assertSame('admin', $data['role']);
        $row = $this->rows('SELECT token_version FROM users WHERE id = ?', [$target]);
        $this->assertSame(2, (int) $row[0]['token_version']);
    }

    public function testUpdateRejectsWhenNothingToChange(): void
    {
        $target = $this->uuid();
        $this->seedUser($target, ['role' => 'user']);
        $this->actingAs($this->uuid());

        $this->expectException(HttpException::class);
        try {
            $this->postRequest([]); // 无任何可更新字段
            $this->controller()->update($target);
        } catch (HttpException $e) {
            $this->assertSame(400, $e->getStatusCode());
            throw $e;
        }
    }

    /* ----------------------------- resetPassword ----------------------------- */

    public function testResetPasswordBumpsTokenVersionAndReturnsPassword(): void
    {
        $target = $this->uuid();
        $this->seedUser($target, ['email' => 'rp@test.local', 'token_version' => 3]);

        $data = $this->body($this->controller()->resetPassword($target))['data'];

        $this->assertSame($target, $data['id']);
        $this->assertNotEmpty($data['password']);
        $row = $this->rows('SELECT token_version FROM users WHERE id = ?', [$target]);
        $this->assertSame(4, (int) $row[0]['token_version']); // 3 → 4
    }
}
