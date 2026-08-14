<?php
declare(strict_types=1);

namespace tests\unit;

use app\service\ApiKeyHasher;
use PHPUnit\Framework\TestCase;

/**
 * ApiKeyHasher 单测。
 *
 * 校验与 Go executor (internal/auth/apikey.go) 完全一致的口径:
 *  - generate: sk-+32 / bot-+40,字符取自固定字母表;
 *  - hash: sha256(pepper + rawKey) 的十六进制;
 *  - parts: 脱敏前缀(前 12)/后缀(后 7),短键安全截断。
 *
 * pepper 由 tests/bootstrap.php 通过 putenv('API_KEY_PEPPER=phpunit-test-pepper') 注入。
 */
final class ApiKeyHasherTest extends TestCase
{
    private const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    private const PEPPER   = 'phpunit-test-pepper';

    public function testGenerateApiKeyFormat(): void
    {
        $key = ApiKeyHasher::generateApiKey();

        $this->assertStringStartsWith('sk-', $key);
        $this->assertSame(35, strlen($key)); // 'sk-' + 32
        $body = substr($key, 3);
        for ($i = 0, $n = strlen($body); $i < $n; $i++) {
            $this->assertStringContainsString($body[$i], self::ALPHABET);
        }
    }

    public function testGenerateBotKeyFormat(): void
    {
        $key = ApiKeyHasher::generateBotKey();

        $this->assertStringStartsWith('bot-', $key);
        $this->assertSame(44, strlen($key)); // 'bot-' + 40
        $body = substr($key, 4);
        for ($i = 0, $n = strlen($body); $i < $n; $i++) {
            $this->assertStringContainsString($body[$i], self::ALPHABET);
        }
    }

    public function testGeneratedKeysAreRandom(): void
    {
        $a = ApiKeyHasher::generateApiKey();
        $b = ApiKeyHasher::generateApiKey();
        $this->assertNotSame($a, $b);

        $c = ApiKeyHasher::generateBotKey();
        $d = ApiKeyHasher::generateBotKey();
        $this->assertNotSame($c, $d);
    }

    public function testHashIsDeterministicAndMatchesFormula(): void
    {
        $raw = 'sk-abcdef123456';

        // 与 Go 完全一致:sha256(pepper + rawKey)
        $expected = hash('sha256', self::PEPPER . $raw);

        $this->assertSame($expected, ApiKeyHasher::hash($raw));
        $this->assertSame(64, strlen(ApiKeyHasher::hash($raw)));
    }

    public function testHashDiffersPerKey(): void
    {
        $this->assertNotSame(
            ApiKeyHasher::hash('sk-key-one'),
            ApiKeyHasher::hash('sk-key-two')
        );
    }

    public function testHashDependsOnPepper(): void
    {
        $raw = 'sk-same-key';

        $withDefaultPepper = ApiKeyHasher::hash($raw);

        try {
            putenv('API_KEY_PEPPER=a-different-pepper');
            $withOtherPepper = ApiKeyHasher::hash($raw);

            $this->assertNotSame($withDefaultPepper, $withOtherPepper);
            $this->assertSame(hash('sha256', 'a-different-pepper' . $raw), $withOtherPepper);
        } finally {
            putenv('API_KEY_PEPPER=' . self::PEPPER);
        }
    }

    public function testPartsNormalKey(): void
    {
        $key = 'sk-abcdefghijklmno_qrstuvwxyz0123456789';
        [$prefix, $suffix] = ApiKeyHasher::parts($key);

        $this->assertSame(substr($key, 0, 12), $prefix);
        $this->assertSame(substr($key, -7), $suffix);
    }

    public function testPartsShortKeyTruncatesSafely(): void
    {
        // 长度 < 12:前缀取全长,后缀取后 7(若不足 7 则取全长)
        $key = 'sk-ab';
        [$prefix, $suffix] = ApiKeyHasher::parts($key);

        $this->assertSame('sk-ab', $prefix);
        $this->assertSame('sk-ab', $suffix); // min(7, 5) = 5
    }

    public function testPartsKeyShorterThanSuffixLen(): void
    {
        $key = 'ab'; // 长度 2
        [$prefix, $suffix] = ApiKeyHasher::parts($key);

        $this->assertSame('ab', $prefix);
        $this->assertSame('ab', $suffix);
    }
}
