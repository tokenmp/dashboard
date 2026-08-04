<?php
namespace app\service;

use think\facade\Cache;
use think\facade\Env;

/**
 * 密码传输加密：临时 RSA 密钥对
 *
 * 每次取 key 时现场生成 RSA-2048 密钥对，私钥仅存缓存 AUTH_KEY_TTL 秒且**一次性使用**
 *（读取即删）。前端用公钥以 RSA-OAEP(SHA-1) 加密密码，后端用私钥解密后再走 bcrypt。
 *
 * 设计要点：
 * - 无长存私钥 / env 私钥，密钥对每次现生成，运维零负担；
 * - OAEP 哈希固定 SHA-1：因 PHP openssl_private_decrypt 的 OAEP 仅支持 SHA-1，
 *   WebCrypto 端 importKey 必须 hash:'SHA-1' 才能互通；
 * - 取 key 端点按 IP 限流（防 RSA keygen 被刷成 CPU DoS）。
 */
class SecretCrypto
{
    private const CACHE_PREFIX = 'authkey:';    // 私钥缓存前缀
    private const RATE_PREFIX  = 'authkey_rl:'; // 限流计数前缀
    private const KEY_BITS     = 2048;

    /**
     * 签发一次性密钥
     *
     * @return array{0:string,1:string,2:int} [keyId, publicKey(SPKI base64), expiresIn]
     */
    public static function issueKey(): array
    {
        $res = openssl_pkey_new([
            'private_key_bits' => self::KEY_BITS,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);
        if (!$res) {
            throw new \RuntimeException('生成 RSA 密钥失败: ' . openssl_error_string());
        }

        openssl_pkey_export($res, $privatePem);
        $publicPem = openssl_pkey_get_details($res)['key']; // SPKI PEM

        $keyId = bin2hex(random_bytes(32)); // 64 位 hex，不可猜
        $ttl   = self::ttl();
        Cache::set(self::CACHE_PREFIX . $keyId, $privatePem, $ttl);

        return [$keyId, self::pemToSpkiBase64($publicPem), $ttl];
    }

    /**
     * 用一次性私钥解密；失败（密钥已用 / 过期 / 无效 / 密文非法）返回 null
     */
    public static function decrypt(string $cipherB64, string $keyId): ?string
    {
        // keyId 格式校验，避免无效缓存查询
        if ($keyId === '' || !preg_match('/^[0-9a-f]{64}$/', $keyId)) {
            return null;
        }

        $key        = self::CACHE_PREFIX . $keyId;
        $privatePem = Cache::get($key);
        if (!$privatePem) {
            return null;
        }
        Cache::delete($key); // 一次性：读取即删

        $binary = base64_decode($cipherB64, true);
        if ($binary === false) {
            return null;
        }

        $plain = '';
        $ok    = openssl_private_decrypt($binary, $plain, $privatePem, OPENSSL_PKCS1_OAEP_PADDING);
        return ($ok && $plain !== '') ? $plain : null;
    }

    /**
     * 取 key 的 IP 限流：每分钟最多 AUTH_KEY_RATE_LIMIT 次，超限返回 false
     */
    public static function acquireKeySlot(string $ip): bool
    {
        if ($ip === '') {
            return true; // 拿不到 IP 时不拦（极端情况，避免误伤）
        }

        $max = self::rateLimit();
        $key = self::RATE_PREFIX . date('YmdHi') . ':' . $ip; // 按分钟滚动窗口

        if (!Cache::has($key)) {
            Cache::set($key, 1, 70);
            return 1 <= $max;
        }
        $count = (int) Cache::inc($key);
        return $count <= $max;
    }

    private static function ttl(): int
    {
        return (int) Env::get('AUTH_KEY_TTL', 300);
    }

    private static function rateLimit(): int
    {
        return (int) Env::get('AUTH_KEY_RATE_LIMIT', 20);
    }

    /**
     * 公钥 PEM → SPKI DER 的 base64（去 -----BEGIN/END----- 与换行）
     */
    private static function pemToSpkiBase64(string $pem): string
    {
        $body = preg_replace('/-----[^-]+-----/', '', $pem);
        return preg_replace('/\s+/', '', (string) $body);
    }
}
