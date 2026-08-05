<?php
declare(strict_types=1);

namespace app\service;

/**
 * API Key / Bot Key 生成与哈希——与 Go executor 的方案完全一致，保证 PHP 创建的密钥能被 executor 鉴权。
 *
 * 对应 Go 实现（internal/auth/apikey.go）：
 * - GenerateAPIKey：sk- + 32 随机字符
 * - GenerateBotKey：bot- + 40 随机字符
 * - HashAPIKey：sha256(pepper + rawKey) 的十六进制
 * - APIKeyParts：前缀取前 12 字符、后缀取后 7 字符（脱敏展示用）
 *
 * pepper 通过环境变量 API_KEY_PEPPER 注入，须与生产 executor 一致。
 */
class ApiKeyHasher
{
    private const API_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    /** 生成 API Key 明文：sk- + 32 位随机字符 */
    public static function generateApiKey(): string
    {
        return 'sk-' . self::randomChars(32);
    }

    /** 生成 Bot Key 明文：bot- + 40 位随机字符 */
    public static function generateBotKey(): string
    {
        return 'bot-' . self::randomChars(40);
    }

    /**
     * 哈希：sha256(pepper + rawKey) 的十六进制。
     * 明文永不落库，只存哈希；鉴权时 executor 用相同算法反查。
     */
    public static function hash(string $rawKey): string
    {
        $pepper = (string) getenv('API_KEY_PEPPER');
        return hash('sha256', $pepper . $rawKey);
    }

    /**
     * 脱敏展示用的前缀（前 12）与后缀（后 7），与 Go APIKeyParts 一致。
     *
     * @return array{0:string,1:string} [prefix, suffix]
     */
    public static function parts(string $rawKey): array
    {
        $len        = strlen($rawKey);
        $prefixLen  = min(12, $len);
        $suffixLen  = min(7, $len);
        return [substr($rawKey, 0, $prefixLen), substr($rawKey, -$suffixLen)];
    }

    /** 用密码学安全的随机字节映射到字母表（与 Go crypto/rand + int(b)%len 同法） */
    private static function randomChars(int $length): string
    {
        $alphabet = self::API_ALPHABET;
        $size     = strlen($alphabet);
        $bytes    = random_bytes($length);
        $out      = '';
        for ($i = 0; $i < $length; $i++) {
            $out .= $alphabet[ord($bytes[$i]) % $size];
        }
        return $out;
    }
}
