<?php
declare(strict_types=1);

namespace app\service;

use think\exception\HttpException;
use think\facade\Db;
use think\facade\Env;

/**
 * 上游 Key 共享服务：加解密（AES-256-GCM，与 executor crypto 对齐）、连通性探测、
 * 校验记录落库。admin（dashboard/Upstream）与用户面（panel/Upstream）共用，
 * 保证两端的密文格式与探测行为完全一致。
 *
 * 密文格式：v1:+base64url(nonce+ciphertext+tag)，key=sha256(MASTER_ENCRYPTION_KEY)。
 * MASTER_ENCRYPTION_KEY 必须与 executor 容器一致（来自同一份 /opt/tokenmp/secrets.env）。
 */
class UpstreamKeyService
{
    /** AES-256-GCM 加密（与执行器 crypto 对齐） */
    public static function encryptKey(string $plaintext): string
    {
        $masterKey = (string) Env::get('MASTER_ENCRYPTION_KEY', '');
        if ($masterKey === '') {
            throw new HttpException(500, '未配置 MASTER_ENCRYPTION_KEY');
        }
        $key = hash('sha256', $masterKey, true);
        $nonce = random_bytes(12);
        $tag = '';
        $ct = openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag);
        if ($ct === false) {
            throw new HttpException(500, '加密失败');
        }
        return 'v1:' . rtrim(strtr(base64_encode($nonce . $ct . $tag), '+/', '-_'), '=');
    }

    /** AES-256-GCM 解密（与执行器 crypto 对齐） */
    public static function decryptKey(string $ciphertext): string
    {
        $masterKey = (string) Env::get('MASTER_ENCRYPTION_KEY', '');
        if ($masterKey === '' || !str_starts_with($ciphertext, 'v1:')) {
            throw new HttpException(500, '解密失败');
        }
        $s = strtr(substr($ciphertext, 3), '-_', '+/');
        $pad = strlen($s) % 4;
        if ($pad) {
            $s .= str_repeat('=', 4 - $pad);
        }
        $payload = base64_decode($s, true);
        if ($payload === false || strlen($payload) < 28) {
            throw new HttpException(500, '解密失败');
        }
        $key = hash('sha256', $masterKey, true);
        $nonce = substr($payload, 0, 12);
        $tag = substr($payload, -16);
        $ct = substr($payload, 12, -16);
        $pt = openssl_decrypt($ct, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag);
        if ($pt === false) {
            throw new HttpException(500, '解密失败');
        }
        return $pt;
    }

    /** PG 侧生成 UUID（与控制器内既有用法一致） */
    public static function genUuid(): string
    {
        return Db::connect('pgsql')->query('select gen_random_uuid() as id')[0]['id'];
    }

    /**
     * 用 cURL 发最小探测请求，按协议构造 auth 与 body。
     *
     * @return array{status:string,http_status:?int,latency_ms:int,error_code:string,error_message:string,verified_models:string[]}
     */
    public static function doProbe(string $baseUrl, string $path, string $protocol, string $authType, string $rawKey, string $model): array
    {
        $url = rtrim((string) $baseUrl, '/') . $path;
        $headers = ['Content-Type: application/json', 'Accept: application/json'];
        $authType = $authType !== '' ? $authType : 'bearer';
        if ($authType === 'x-api-key') {
            $headers[] = 'x-api-key: ' . $rawKey;
            $headers[] = 'anthropic-version: 2023-06-01';
        } else {
            $headers[] = 'Authorization: Bearer ' . $rawKey;
        }
        $protocol = $protocol !== '' ? $protocol : 'openai_chat';
        if ($protocol === 'openai_responses') {
            $body = json_encode(['model' => $model, 'input' => 'hi', 'max_output_tokens' => 1]);
        } else {
            $body = json_encode(['model' => $model, 'messages' => [['role' => 'user', 'content' => 'hi']], 'max_tokens' => 1]);
        }

        $start = microtime(true);
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        $resp = (string) curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = (string) curl_error($ch);
        curl_close($ch);
        $latency = (int) round((microtime(true) - $start) * 1000);

        if ($err !== '' || $http === 0) {
            return ['status' => 'failed', 'http_status' => null, 'latency_ms' => $latency, 'error_code' => 'NETWORK', 'error_message' => $err !== '' ? $err : '请求失败', 'verified_models' => []];
        }
        $status = ($http >= 200 && $http < 300) ? 'success' : 'failed';
        $errMsg = '';
        $errCode = '';
        $data = json_decode($resp, true);
        if (is_array($data)) {
            $errMsg = (string) ($data['error']['message'] ?? $data['message'] ?? '');
            $errCode = (string) ($data['error']['code'] ?? $data['error']['type'] ?? '');
        }
        $verified = ($status === 'success' && $model !== '') ? [$model] : [];
        return ['status' => $status, 'http_status' => $http, 'latency_ms' => $latency, 'error_code' => $errCode, 'error_message' => $errMsg, 'verified_models' => $verified];
    }

    /**
     * 探测结果落库：写 upstream_key_verifications 并回写 key 的 verified_at /
     * last_validation_error。
     *
     * @param array $result doProbe 的返回值
     */
    public static function recordVerification(string $keyId, array $result): void
    {
        $vid = self::genUuid();
        Db::connect('pgsql')->execute(
            "INSERT INTO upstream_key_verifications (id, upstream_key_id, status, http_status, latency_ms, error_code, error_message, verified_models, created_at) "
            . "VALUES (?,?,?,?, ?, ?, ?, ?::jsonb, NOW())",
            [$vid, $keyId, $result['status'], $result['http_status'], $result['latency_ms'], $result['error_code'] ?: null, $result['error_message'] ?: null, json_encode($result['verified_models'])]
        );
        Db::connect('pgsql')->execute(
            "UPDATE upstream_keys SET verified_at = NOW(), last_validation_error = ?, updated_at = NOW() WHERE id = ?",
            [$result['status'] === 'success' ? null : $result['error_message'], $keyId]
        );
    }
}
