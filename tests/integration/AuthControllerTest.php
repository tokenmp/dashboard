<?php
declare(strict_types=1);

namespace tests\integration;

use app\controller\auth\Auth as AuthController;
use app\service\Jwt;
use app\service\SecretCrypto;

/**
 * auth 登录控制器集成测试。
 *
 * 端到端验证登录流程:一次性 RSA 公钥加密密码 → 解密 → bcrypt 校验 → 签发 JWT。
 * 重点校验安全语义:账号枚举防护(账号不存在与密码错误同响应)、禁用账号、密钥失效。
 */
final class AuthControllerTest extends IntegrationTestCase
{
    private const PASSWORD = 'correct-horse-battery-staple';
    private string $hash;

    protected function setUp(): void
    {
        parent::setUp();
        $this->hash = password_hash(self::PASSWORD, PASSWORD_DEFAULT);
    }

    /** 用签发的一次性公钥以 RSA-OAEP 加密明文密码,返回 base64 密文。 */
    private function encryptPassword(string $plain): array
    {
        [$keyId, $pubB64] = SecretCrypto::issueKey();
        $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split($pubB64, 64, "\n") . "-----END PUBLIC KEY-----\n";
        $pub = openssl_pkey_get_public($pem);
        openssl_public_encrypt($plain, $cipher, $pub, OPENSSL_PKCS1_OAEP_PADDING);

        return ['keyId' => $keyId, 'password' => base64_encode($cipher)];
    }

    /** 调 login(),返回响应对象。$staleKey=true 时用一个格式合法但未签发的 keyId。 */
    private function login(string $email, string $plainPassword, bool $staleKey = false)
    {
        if ($staleKey) {
            $post = ['username' => $email, 'password' => base64_encode('x'), 'keyId' => str_repeat('0', 64)];
        } else {
            $enc = $this->encryptPassword($plainPassword);
            $post = ['username' => $email, 'password' => $enc['password'], 'keyId' => $enc['keyId']];
        }
        $this->postRequest($post);

        return (new AuthController(app()))->login();
    }

    /* ----------------------------- 成功 ----------------------------- */

    public function testLoginSuccessIssuesValidToken(): void
    {
        $userId = $this->uuid();
        $email  = 'alice@test.local';
        $this->seedUser($userId, ['email' => $email, 'role' => 'user', 'status' => 'active', 'password_hash' => $this->hash]);

        $resp = $this->login($email, self::PASSWORD);

        $this->assertSame(200, $this->httpCode($resp));
        $body = $this->body($resp);
        $this->assertSame(0, $body['code']);
        $this->assertSame($email, $body['data']['username']);
        $this->assertNotEmpty($body['data']['token']);

        // token 可校验且 sub 正确
        $payload = Jwt::verify($body['data']['token']);
        $this->assertSame($userId, $payload->sub);
        $this->assertSame($email, $payload->email);
    }

    public function testAdminCanLogin(): void
    {
        $userId = $this->uuid();
        $email  = 'root@test.local';
        $this->seedUser($userId, ['email' => $email, 'role' => 'admin', 'status' => 'active', 'password_hash' => $this->hash]);

        $resp = $this->login($email, self::PASSWORD);

        $body = $this->body($resp);
        $this->assertSame(0, $body['code']);
        $payload = Jwt::verify($body['data']['token']);
        $this->assertSame('admin', $payload->role);
    }

    /* ----------------------------- 失败分支 ----------------------------- */

    public function testEmptyFieldsRejected422(): void
    {
        $this->postRequest(['username' => '', 'password' => '', 'keyId' => '']);
        $resp = (new AuthController(app()))->login();

        $this->assertSame(422, $this->httpCode($resp));
        $this->assertSame(1, $this->body($resp)['code']);
    }

    public function testWrongPasswordRejected401(): void
    {
        $userId = $this->uuid();
        $email  = 'bob@test.local';
        $this->seedUser($userId, ['email' => $email, 'role' => 'user', 'status' => 'active', 'password_hash' => $this->hash]);

        $resp = $this->login($email, 'wrong-password');

        $this->assertSame(401, $this->httpCode($resp));
        $this->assertSame(1, $this->body($resp)['code']);
    }

    public function testUnknownAccountRejected401SameAsWrongPassword(): void
    {
        // 账号枚举防护:不存在的账号与密码错误响应一致(401 + 相同业务码/文案)
        $resp = $this->login('nobody@test.local', self::PASSWORD);

        $this->assertSame(401, $this->httpCode($resp));
        $body = $this->body($resp);
        $this->assertSame(1, $body['code']);
        $this->assertSame('账号或密码错误', $body['message']);
    }

    public function testDisabledUserRejected403(): void
    {
        $userId = $this->uuid();
        $email  = 'banned@test.local';
        $this->seedUser($userId, ['email' => $email, 'role' => 'user', 'status' => 'disabled', 'password_hash' => $this->hash]);

        $resp = $this->login($email, self::PASSWORD);

        $this->assertSame(403, $this->httpCode($resp));
        $this->assertSame(1, $this->body($resp)['code']);
    }

    public function testStaleKeyRejected410(): void
    {
        $userId = $this->uuid();
        $email  = 'carol@test.local';
        $this->seedUser($userId, ['email' => $email, 'role' => 'user', 'status' => 'active', 'password_hash' => $this->hash]);

        // keyId 格式合法但未签发 → 解密失败 → 专用错误(前端重取 key 重试)
        $resp = $this->login($email, self::PASSWORD, true);

        $this->assertSame(410, $this->httpCode($resp));
        $this->assertSame(2, $this->body($resp)['code']);
    }
}
