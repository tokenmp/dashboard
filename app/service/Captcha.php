<?php
declare(strict_types=1);

namespace app\service;

use AlibabaCloud\SDK\Captcha\V20230305\Captcha as AliyunCaptchaClient;
use AlibabaCloud\SDK\Captcha\V20230305\Models\VerifyIntelligentCaptchaRequest;
use Darabonba\OpenApi\Models\Config;
use think\facade\Cache;
use think\facade\Db;

/**
 * 阿里云验证码 2.0（滑块）服务端校验与配置下发。
 *
 * system_config 约定（与旧栈 Go 服务一致，值存 JSONB）：
 *   captcha_access_key_id / captcha_access_key_secret  阿里云 AK/SK（仅服务端使用）
 *   captcha_prefix / captcha_region                     前端 SDK 初始化参数
 *   captcha_register_scene_id / captcha_login_scene_id  场景 ID，空 = 该场景未启用
 *
 * 服务端核验走官方 SDK（alibabacloud/captcha-20230305，与旧栈 Go 同族），
 * 调 VerifyIntelligentCaptcha。客户端按 AK+region 静态复用。
 *
 * 守卫语义（guard，对齐旧栈 user_auth 行为）：
 *   - sceneId 为空（未配置）        → 直接放行（该场景不启用人机验证）
 *   - captcha_verify_param 非空     → 调阿里云核验，不通过则拒绝
 *   - param 为空（SDK 加载失败降级）→ 走更严的按 IP 限流，超限拒绝
 */
class Captcha
{
    /** param 为空时的降级限流：每 IP 每场景每分钟次数 */
    private const FALLBACK_LIMIT_PER_MIN = 10;

    /** @var array<string, AliyunCaptchaClient> 按 ak+region 复用的客户端 */
    private static array $clients = [];

    /**
     * 公开配置（前端 SDK 初始化用，绝不含 AK/SK）。
     * @return array{prefix:string, region:string, register_scene_id:string, login_scene_id:string}
     */
    public static function publicConfig(): array
    {
        $cfg = self::loadConfig();
        return [
            'prefix'            => $cfg['prefix'],
            'region'            => $cfg['region'],
            'register_scene_id' => $cfg['register_scene_id'],
            'login_scene_id'    => $cfg['login_scene_id'],
        ];
    }

    /**
     * 统一守卫：通过返回 null；未通过返回 fail() 响应（调用方直接 return）。
     *
     * @param string $scene 'login' | 'register'
     * @param string|null $param 前端 SDK 回传的 captchaVerifyParam
     */
    public static function guard(string $scene, ?string $param): ?object
    {
        $cfg     = self::loadConfig();
        $sceneId = $scene === 'login' ? $cfg['login_scene_id'] : $cfg['register_scene_id'];

        // 场景未配置：不启用人机验证
        if ($sceneId === '') {
            return null;
        }

        $param = trim((string) $param);

        // 带验证票据：调阿里云核验
        if ($param !== '') {
            if ($cfg['ak'] === '' || $cfg['sk'] === '') {
                trace('[Captcha] 场景已配置但缺少 AK/SK，视为未启用', 'error');
                return null;
            }
            try {
                $ok = self::verify($cfg, $param, $sceneId);
            } catch (\Throwable $e) {
                trace('[Captcha] 调用阿里云失败：' . $e->getMessage(), 'error');
                return fail('人机验证服务暂不可用，请稍后再试', 4, 500);
            }
            if (!$ok) {
                return fail('人机验证未通过，请重试', 3, 400);
            }
            return null;
        }

        // 无票据降级：按 IP 限流（正常用户始终带票据，只有前端 SDK 挂了才走这里）
        $ip  = request()->ip();
        $key = "captcha_fb_{$scene}_" . md5($ip);
        $n   = (int) Cache::get($key, 0);
        if ($n >= self::FALLBACK_LIMIT_PER_MIN) {
            return fail('操作过于频繁，请完成人机验证后重试', 5, 429);
        }
        Cache::set($key, $n + 1, 60);
        return null;
    }

    /**
     * 读取并解码 system_config 中的验证码配置。
     * @return array{ak:string, sk:string, prefix:string, region:string, register_scene_id:string, login_scene_id:string}
     */
    private static function loadConfig(): array
    {
        $rows = Db::connect('pgsql')
            ->table('system_config')
            ->where('key', 'in', [
                'captcha_access_key_id', 'captcha_access_key_secret',
                'captcha_prefix', 'captcha_region',
                'captcha_register_scene_id', 'captcha_login_scene_id',
            ])
            ->column('value', 'key');

        return [
            'ak'                => self::parseValue($rows['captcha_access_key_id'] ?? ''),
            'sk'                => self::parseValue($rows['captcha_access_key_secret'] ?? ''),
            'prefix'            => self::parseValue($rows['captcha_prefix'] ?? ''),
            'region'            => self::parseValue($rows['captcha_region'] ?? 'cn'),
            'register_scene_id' => self::parseValue($rows['captcha_register_scene_id'] ?? ''),
            'login_scene_id'    => self::parseValue($rows['captcha_login_scene_id'] ?? ''),
        ];
    }

    /** JSONB 字符串值形如 "\"xxx\""，去引号；非合法 JSON 原样返回。 */
    private static function parseValue($v): string
    {
        if ($v === null) {
            return '';
        }
        $v = (string) $v;
        $d = json_decode($v);
        return is_string($d) ? $d : $v;
    }

    /** 取（或复用）阿里云验证码客户端。 */
    private static function client(array $cfg): AliyunCaptchaClient
    {
        $k = md5($cfg['ak'] . '|' . $cfg['region']);
        if (!isset(self::$clients[$k])) {
            $config = new Config([
                'accessKeyId'     => $cfg['ak'],
                'accessKeySecret' => $cfg['sk'],
                // 验证码 2.0 是统一接入点（captcha.aliyuncs.com），无区域子域名；
                // region 字段只供前端 SDK 使用（cn 等），不参与后端 endpoint 拼接。
                'endpoint'        => 'captcha.aliyuncs.com',
                'connectTimeout'  => 5000,
                'readTimeout'     => 5000,
            ]);
            self::$clients[$k] = new AliyunCaptchaClient($config);
        }
        return self::$clients[$k];
    }

    /**
     * 核验滑块票据，返回 VerifyResult。
     * 传输/鉴权层异常直接抛出（guard 统一转 5xx）；业务返回 false 不抛。
     */
    private static function verify(array $cfg, string $param, string $sceneId): bool
    {
        $resp = self::client($cfg)->verifyIntelligentCaptcha(
            new VerifyIntelligentCaptchaRequest([
                'captchaVerifyParam' => $param,
                'sceneId'            => $sceneId,
            ])
        );
        $body = $resp->body;
        // 网关/业务错误：code 非空且非 "Success" 才是失败（成功时 code="Success"）
        $code = $body?->code;
        if ($body !== null && $code !== null && $code !== '' && $code !== 'Success') {
            throw new \RuntimeException('captcha api error: ' . $code . ' ' . (string) $body->message);
        }
        return (bool) ($body?->result?->verifyResult ?? false);
    }
}
