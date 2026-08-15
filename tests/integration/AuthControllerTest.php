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

    /* ----------------------------- 注册 ----------------------------- */

    /** 测试用注册验证码（6 位，测试里直接种缓存 bcrypt 哈希，与生产同构）。 */
    private const REG_CODE = '654321';

    /** 在缓存中为邮箱种一条注册验证码（绕过 send-code 的滑块与 SMTP）。 */
    private function seedRegCode(string $email): void
    {
        \think\facade\Cache::set('regcode_' . md5($email), [
            'hash'     => password_hash(self::REG_CODE, PASSWORD_BCRYPT),
            'attempts' => 0,
        ], 300);
    }

    /** 调 register(),返回响应对象。默认带正确验证码；传 null 表示不带。 */
    private function register(string $email, string $plainPassword, ?string $code = self::REG_CODE)
    {
        if ($code !== null) {
            $this->seedRegCode($email);
        }
        $enc = $this->encryptPassword($plainPassword);
        $this->postRequest(array_filter([
            'username'   => $email,
            'password'   => $enc['password'],
            'keyId'      => $enc['keyId'],
            'email_code' => $code,
        ], fn ($v) => $v !== null));

        return (new AuthController(app()))->register();
    }

    public function testRegisterCreatesActiveUserAndIssuesToken(): void
    {
        $resp = $this->register('new-user@test.local', self::PASSWORD);

        $this->assertSame(200, $this->httpCode($resp));
        $body = $this->body($resp);
        $this->assertSame(0, $body['code']);
        $this->assertSame('new-user@test.local', $body['data']['username']);

        // token 可校验，且落库用户为 active 的普通角色
        $payload = Jwt::verify($body['data']['token']);
        $this->assertSame('new-user@test.local', $payload->email);
        $this->assertSame('user', $payload->role);
        // sub 必须非空：think-orm 不回填 DB 默认主键，id 需显式生成（否则 token 无法用于 auth/user）
        $this->assertNotNull($payload->sub);
        $this->assertNotSame('', $payload->sub);
        // v（token_version）必须取 DB 真实值，否则 Auth 中间件比对失败 → 登录已失效
        $this->assertSame(1, $payload->v);

        $row = $this->rows('SELECT role, status FROM users WHERE email = ?', ['new-user@test.local']);
        $this->assertCount(1, $row);
        $this->assertSame('user', $row[0]['role']);
        $this->assertSame('active', $row[0]['status']);

        // 密码已 bcrypt 落库且可用新密码直接登录
        $resp = $this->login('new-user@test.local', self::PASSWORD);
        $this->assertSame(0, $this->body($resp)['code']);
    }

    public function testRegisterRejectsDuplicateEmail(): void
    {
        $this->seedUser($this->uuid(), ['email' => 'dup@test.local', 'password_hash' => $this->hash]);

        $resp = $this->register('dup@test.local', self::PASSWORD);

        $this->assertSame(409, $this->httpCode($resp));
        $this->assertSame(1, $this->body($resp)['code']);
    }

    public function testRegisterRejectsShortPasswordAndBadEmail(): void
    {
        $short = $this->register('ok@test.local', '1234567');
        $this->assertSame(422, $this->httpCode($short));

        $bad = $this->register('not-an-email', self::PASSWORD);
        $this->assertSame(422, $this->httpCode($bad));

        // 均未落库
        $this->assertSame(0, (int) $this->rows('SELECT count(*) AS c FROM users')[0]['c']);
    }

    public function testRegisterRequiresEmailCode(): void
    {
        // 未获取验证码（缓存无条目）→ 400
        $noCode = $this->register('nocode@test.local', self::PASSWORD, null);
        $this->assertSame(422, $this->httpCode($noCode));

        // 验证码错误 → 400，且不落库
        $wrong = $this->register('wrongcode@test.local', self::PASSWORD, '000000');
        $this->assertSame(400, $this->httpCode($wrong));
        $this->assertSame(0, (int) $this->rows('SELECT count(*) AS c FROM users')[0]['c']);
    }
}
