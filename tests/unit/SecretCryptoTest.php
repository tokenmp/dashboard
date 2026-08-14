<?php
declare(strict_types=1);

namespace tests\unit;

use app\service\SecretCrypto;
use PHPUnit\Framework\TestCase;
use think\facade\Cache;
use think\facade\Env;

/**
 * SecretCrypto 单测:一次性 RSA 密钥对的签发 / 解密 / IP 限流。
 *
 * 端到端验证前端→后端的密码传输路径:用签发的公钥以 RSA-OAEP(SHA-1) 加密,
 * 后端 decrypt 应回出明文,且私钥一次性(读取即删)。
 */
final class SecretCryptoTest extends TestCase
{
    /** 把 issueKey 返回的 SPKI base64 重新包成 PEM,供 openssl 使用。 */
    private function spkiToPem(string $spkiB64): string
    {
        return "-----BEGIN PUBLIC KEY-----\n"
            . chunk_split($spkiB64, 64, "\n")
            . "-----END PUBLIC KEY-----\n";
    }

    /** 用公钥以 RSA-OAEP(SHA-1) 加密明文,返回 base64 密文(模拟前端 WebCrypto)。 */
    private function encryptWithPublicKey(string $plain, string $pubB64): string
    {
        $pub    = openssl_pkey_get_public($this->spkiToPem($pubB64));
        $cipher = '';
        $ok     = openssl_public_encrypt($plain, $cipher, $pub, OPENSSL_PKCS1_OAEP_PADDING);
        $this->assertTrue($ok, 'openssl_public_encrypt 失败');
        return base64_encode($cipher);
    }

    /* --------------------------- issueKey --------------------------- */

    public function testIssueKeyReturnsWellFormedTriple(): void
    {
        [$keyId, $pubB64, $ttl] = SecretCrypto::issueKey();

        $this->assertSame(1, preg_match('/^[0-9a-f]{64}$/', $keyId), "keyId 应为 64 位 hex: $keyId");

        // 公钥是去头去尾、去换行的 SPKI base64
        $this->assertStringNotContainsString('-----', $pubB64);
        $this->assertStringNotContainsString("\n", $pubB64);
        $this->assertStringNotContainsString(' ', $pubB64);
        $this->assertSame(1, preg_match('#^[A-Za-z0-9+/]+={0,2}$#', $pubB64));

        // ttl 取自 AUTH_KEY_TTL(bootstrap=300)
        $this->assertSame(300, $ttl);

        // 清理:issueKey 会把私钥写入缓存,显式删掉避免泄漏到其他用例
        Cache::delete('authkey:' . $keyId);
    }

    public function testIssuedKeyIdsAreUnique(): void
    {
        [$id1] = SecretCrypto::issueKey();
        [$id2] = SecretCrypto::issueKey();
        $this->assertNotSame($id1, $id2);
        Cache::delete('authkey:' . $id1);
        Cache::delete('authkey:' . $id2);
    }

    /* --------------------------- decrypt round-trip --------------------------- */

    public function testDecryptReturnsPlaintext(): void
    {
        [$keyId, $pubB64] = SecretCrypto::issueKey();
        $plain  = 'my-secret-password-{:中文}';
        $cipher = $this->encryptWithPublicKey($plain, $pubB64);

        $this->assertSame($plain, SecretCrypto::decrypt($cipher, $keyId));
    }

    public function testPrivateKeyIsOneTimeUse(): void
    {
        [$keyId, $pubB64] = SecretCrypto::issueKey();
        $cipher = $this->encryptWithPublicKey('once', $pubB64);

        $this->assertSame('once', SecretCrypto::decrypt($cipher, $keyId));
        // 同一 keyId 再次解密:私钥已被删 → null
        $this->assertNull(SecretCrypto::decrypt($cipher, $keyId));
    }

    /* --------------------------- decrypt 失败分支 --------------------------- */

    public function testDecryptRejectsMalformedKeyId(): void
    {
        // 空 / 非 hex / 长度不对 都应在格式校验阶段返回 null(不会查缓存)
        $this->assertNull(SecretCrypto::decrypt('anycipher', ''));
        $this->assertNull(SecretCrypto::decrypt('anycipher', 'not-hex-zzz'));
        $this->assertNull(SecretCrypto::decrypt('anycipher', 'abc'));
        $this->assertNull(SecretCrypto::decrypt('anycipher', str_repeat('g', 64)));
    }

    public function testDecryptReturnsNullForUnknownKeyId(): void
    {
        // 格式合法但未签发 → 缓存查不到 → null
        $unknown = str_repeat('0', 64);
        $this->assertNull(SecretCrypto::decrypt(base64_encode('x'), $unknown));
    }

    public function testDecryptReturnsNullForInvalidBase64Cipher(): void
    {
        [$keyId] = SecretCrypto::issueKey();
        // base64_decode(strict) 失败 → null(注意:此时私钥已被消费)
        $this->assertNull(SecretCrypto::decrypt('!!!not-base64!!!', $keyId));
    }

    public function testDecryptReturnsNullForTamperedCiphertext(): void
    {
        [$keyId, $pubB64] = SecretCrypto::issueKey();
        $cipher = $this->encryptWithPublicKey('plain', $pubB64);
        // 翻转密文若干字节,OAEP 解密应失败 → null
        $binary = base64_decode($cipher);
        $binary[0] = chr((ord($binary[0]) + 1) & 0xff);

        $this->assertNull(SecretCrypto::decrypt(base64_encode($binary), $keyId));
    }

    /* --------------------------- acquireKeySlot 限流 --------------------------- */

    public function testAcquireKeySlotEmptyIpAlwaysAllowed(): void
    {
        // 多次调用空 IP 都应放行(拿不到 IP 不拦)
        for ($i = 0; $i < 5; $i++) {
            $this->assertTrue(SecretCrypto::acquireKeySlot(''));
        }
    }

    public function testAcquireKeySlotEnforcesRateLimit(): void
    {
        $original = Env::get('AUTH_KEY_RATE_LIMIT');
        $ip       = '203.0.113.' . random_int(1, 250);
        $rateKey  = 'authkey_rl:' . date('YmdHi') . ':' . $ip;

        try {
            app('env')->set(['AUTH_KEY_RATE_LIMIT' => '2']);

            $this->assertTrue(SecretCrypto::acquireKeySlot($ip));  // 1
            $this->assertTrue(SecretCrypto::acquireKeySlot($ip));  // 2
            $this->assertFalse(SecretCrypto::acquireKeySlot($ip)); // 3 → 超限
        } finally {
            Cache::delete($rateKey);
            app('env')->set(['AUTH_KEY_RATE_LIMIT' => $original]);
        }
    }
}
