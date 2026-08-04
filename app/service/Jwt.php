<?php
namespace app\service;

use Firebase\JWT\JWT as FirebaseJwt;
use Firebase\JWT\Key;
use think\facade\Env;

/**
 * JWT 签发与校验
 *
 * 配置来自 .env：JWT_SECRET（密钥）、JWT_EXPIRE（有效期秒数，默认 7 天）
 */
class Jwt
{
    /**
     * 签发 token
     *
     * @param array $claims 自定义声明，如 ['sub' => $userId, 'username' => 'admin']
     * @return string
     */
    public static function issue(array $claims): string
    {
        $now    = time();
        $expire = (int) Env::get('JWT_EXPIRE', 604800);

        $payload = array_merge([
            'iat' => $now,        // 签发时间
            'exp' => $now + $expire, // 过期时间
        ], $claims);

        return FirebaseJwt::encode($payload, self::secret(), 'HS256');
    }

    /**
     * 校验并解码 token
     *
     * @param string $token
     * @return object 解码后的 payload
     * @throws \Throwable 校验失败时抛出
     */
    public static function verify(string $token): object
    {
        return FirebaseJwt::decode($token, new Key(self::secret(), 'HS256'));
    }

    /**
     * 读取密钥，未配置则抛异常（避免用空密钥签发不安全的 token）
     */
    protected static function secret(): string
    {
        $secret = (string) Env::get('JWT_SECRET', '');
        if ($secret === '') {
            throw new \RuntimeException('JWT_SECRET 未配置，请在 .env 中设置（可参考 .example.env）');
        }
        return $secret;
    }
}
