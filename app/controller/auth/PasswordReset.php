<?php
declare(strict_types=1);

namespace app\controller\auth;

use app\BaseController;
use app\model\User;
use app\service\Captcha;
use app\service\Mailer;
use app\service\SecretCrypto;
use think\facade\Db;

/**
 * 用户自助邮箱重置密码（公开，无需登录）。
 *
 * 路由前缀 /api/v1/auth/password
 * - POST /send-code   发送 6 位数字验证码到邮箱（5 分钟有效，落库 code_hash）
 * - POST /reset       校验验证码后重置密码（bcrypt + token_version++ 吊销旧会话）
 *
 * 安全策略（对齐 Go user_auth 行为）：
 * - 防枚举：send-code 无论邮箱是否存在都返回成功；用户不存在时静默不发信。
 * - 防时序探测：reset 对不存在/禁用用户仍跑一次 dummy bcrypt 再返回错误。
 * - 验证码一次性：成功后置 used；失败累加 attempt_count，达上限作废。
 * - 新密码经一次性 RSA-OAEP 公钥加密传输（与登录一致，复用 SecretCrypto）。
 */
class PasswordReset extends BaseController
{
    /** 登录失败/账号不存在时用的占位哈希（与 Auth::DUMMY_HASH 一致，防时序探测）。 */
    private const DUMMY_HASH = '$2y$12$smIQMZE9z1vIYqjQazXs3u2ckaEmzx8gkv8fcikJCVwSdOxCJgTee';

    private const CODE_TTL_MINUTES = 5;
    private const MAX_ATTEMPTS     = 5;
    private const MIN_PASSWORD_LEN = 8;

    /**
     * POST /api/v1/auth/password/send-code
     * body: { email }
     */
    public function sendCode()
    {
        // 人机验证守卫：与旧栈一致，忘记密码复用 register scene
        $guard = Captcha::guard('register', $this->request->post('captcha_verify_param'));
        if ($guard !== null) {
            return $guard;
        }

        $email = strtolower(trim((string) $this->request->post('email', '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return fail('邮箱格式不正确', 1, 422);
        }

        // 仅对 active 用户发码；不存在/禁用同样返回成功（防枚举）
        $user = User::where('email', $email)->where('status', 'active')->find();
        if ($user !== null) {
            $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            Db::connect('pgsql')->execute(
                'insert into password_reset_codes (email, code_hash, expires_at)'
                . ' values (?, ?, now() + interval \'' . self::CODE_TTL_MINUTES . ' minutes\')',
                [$email, password_hash($code, PASSWORD_BCRYPT)]
            );
            // 投递失败也不阻断（防探测；真实失败由用户「没收到码」感知）
            try {
                Mailer::sendVerificationCode($email, $code);
            } catch (\Throwable $e) {
                trace('[PasswordReset] 发送验证码失败：' . $e->getMessage(), 'error');
            }
        }

        return success(['sent' => true], '若该邮箱已注册，验证码已发送');
    }

    /**
     * POST /api/v1/auth/password/reset
     * body: { email, code, password(RSA-OAEP 密文), keyId }
     */
    public function reset()
    {
        $email      = strtolower(trim((string) $this->request->post('email', '')));
        $code       = (string) $this->request->post('code', '');
        $encPwd     = (string) $this->request->post('password', ''); // RSA-OAEP 密文(base64)
        $keyId      = (string) $this->request->post('keyId', '');

        if ($email === '' || $code === '' || $encPwd === '' || $keyId === '') {
            return fail('参数不完整', 1, 422);
        }

        // 一次性私钥解密新密码（与登录一致）
        $password = SecretCrypto::decrypt($encPwd, $keyId);
        if ($password === null) {
            return fail('加密凭证已失效，请重试', 2, 410);
        }
        if (strlen($password) < self::MIN_PASSWORD_LEN) {
            return fail('密码至少 ' . self::MIN_PASSWORD_LEN . ' 位', 1, 422);
        }

        // 查用户（active）
        $user = User::where('email', $email)->where('status', 'active')->find();
        if ($user === null) {
            // 恒定时间：跑一次 dummy bcrypt 再拒绝（防时序枚举）
            password_verify($password, self::DUMMY_HASH);
            return fail('验证码无效或已过期', 1, 400);
        }

        // 取最新一条未使用、未过期、未达失败上限的码
        $row = Db::connect('pgsql')->query(
            'select id, code_hash from password_reset_codes'
            . ' where email = ? and used = false and expires_at > now()'
            . ' and attempt_count < ?'
            . ' order by created_at desc limit 1',
            [$email, self::MAX_ATTEMPTS]
        );
        if (empty($row) || !password_verify($code, $row[0]['code_hash'])) {
            // 失败累加 attempt_count（达上限后该码作废）
            if (!empty($row)) {
                Db::connect('pgsql')->execute(
                    'update password_reset_codes set attempt_count = attempt_count + 1 where id = ?',
                    [$row[0]['id']]
                );
            }
            return fail('验证码无效或已过期', 1, 400);
        }

        // 成功：置 used
        Db::connect('pgsql')->execute(
            'update password_reset_codes set used = true where id = ?',
            [$row[0]['id']]
        );

        // 重置密码：bcrypt + token_version++（吊销全部旧 JWT）
        $hash = password_hash($password, PASSWORD_BCRYPT);
        Db::connect('pgsql')->execute(
            'update users set password_hash = ?, token_version = token_version + 1, updated_at = now() where id = ?',
            [$hash, $user->id]
        );

        return success(['reset' => true], '密码已重置，请使用新密码登录');
    }
}
