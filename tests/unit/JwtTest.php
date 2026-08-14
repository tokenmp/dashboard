<?php
declare(strict_types=1);

namespace tests\unit;

use app\service\Jwt;
use Firebase\JWT\JWT as FirebaseJwt;
use Firebase\JWT\Key;
use PHPUnit\Framework\TestCase;
use think\facade\Env;

/**
 * Jwt 单测:签发 / 校验 round-trip、过期、篡改、密钥缺失。
 */
final class JwtTest extends TestCase
{
    public function testIssueProducesThreePartJws(): void
    {
        $token = Jwt::issue(['sub' => 'u1']);

        $this->assertIsString($token);
        $parts = explode('.', $token);
        $this->assertCount(3, $parts); // header.payload.signature
    }

    public function testVerifyRoundTripPreservesClaims(): void
    {
        $claims = ['sub' => 'user-42', 'username' => 'admin', 'role' => 'super'];
        $token  = Jwt::issue($claims);

        $payload = Jwt::verify($token);

        $this->assertSame('user-42', $payload->sub);
        $this->assertSame('admin', $payload->username);
        $this->assertSame('super', $payload->role);
        $this->assertTrue(property_exists($payload, 'iat'));
        $this->assertTrue(property_exists($payload, 'exp'));
        // exp - iat 应等于当前生效的 JWT_EXPIRE(CI 有 .env 时为 604800,本地 bootstrap 为 3600)
        $this->assertSame((int) Env::get('JWT_EXPIRE', 604800), $payload->exp - $payload->iat);
        $this->assertEqualsWithDelta(time(), $payload->iat, 5); // 容差 5 秒
    }

    public function testCustomExpClaimDoesNotOverrideEnvExpire(): void
    {
        // issue() 用 array_merge,claims 在后——若调用方传 exp 会覆盖默认 exp
        $token  = Jwt::issue(['sub' => 'u2', 'exp' => 9999999999]);
        $payload = Jwt::verify($token);

        $this->assertSame(9999999999, $payload->exp);
    }

    public function testVerifyRejectsTamperedToken(): void
    {
        $token   = Jwt::issue(['sub' => 'u3']);
        $tampered = substr($token, 0, -2) . 'XX';

        $this->expectException(\Throwable::class);
        Jwt::verify($tampered);
    }

    public function testVerifyRejectsExpiredToken(): void
    {
        $secret = Env::get('JWT_SECRET');
        // 直接构造一个已过期的 token(绕过 issue 的 exp 注入)
        $expired = FirebaseJwt::encode(
            ['iat' => time() - 100, 'exp' => time() - 10, 'sub' => 'u4'],
            $secret,
            'HS256'
        );

        $this->expectException(\Throwable::class);
        Jwt::verify($expired);
    }

    public function testVerifyRejectsWrongSecret(): void
    {
        // firebase/php-jwt 要求 HS256 密钥 ≥32 字节,故用一个足够长的错误密钥
        $signedElsewhere = FirebaseJwt::encode(
            ['iat' => time(), 'exp' => time() + 60, 'sub' => 'u5'],
            'a-completely-different-and-definitely-wrong-secret-value',
            'HS256'
        );

        $this->expectException(\Throwable::class);
        Jwt::verify($signedElsewhere);
    }

    public function testIssueThrowsWhenSecretMissing(): void
    {
        $original = Env::get('JWT_SECRET');
        try {
            // 清空密钥,模拟 .env 未配置 JWT_SECRET
            app('env')->set(['JWT_SECRET' => '']);

            $this->expectException(\RuntimeException::class);
            Jwt::issue(['sub' => 'u6']);
        } finally {
            app('env')->set(['JWT_SECRET' => $original]);
        }
    }
}
