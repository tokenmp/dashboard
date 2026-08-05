<?php
declare(strict_types=1);

namespace app\service;

use PHPMailer\PHPMailer\PHPMailer;
use think\facade\Db;

/**
 * 邮件发送（封装 PHPMailer，SMTP 配置来自 system_config）。
 *
 * system_config 约定（与 Go 服务一致，值存 JSONB）：
 *   smtp_host / smtp_port / smtp_user / smtp_password / smtp_from
 * 未配置（host 或 user 为空）视为邮件功能未启用，调用方应据此降级。
 */
class Mailer
{
    /**
     * 发送密码重置验证码邮件。
     *
     * @return bool 是否实际投递（false 表示 SMTP 未配置，不应阻断业务流）
     */
    public static function sendVerificationCode(string $to, string $code): bool
    {
        [$host, $port, $user, $pass, $fromName] = self::smtpConfig();
        if ($host === '' || $user === '') {
            // SMTP 未配置：仅记录日志，返回 false（调用方按防枚举策略吞掉异常）
            trace("[Mailer] SMTP 未配置，跳过发送验证码到 {$to}", 'info');
            return false;
        }

        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host       = $host;
        $mail->Port       = $port;
        $mail->SMTPAuth   = true;
        $mail->Username   = $user;
        $mail->Password   = $pass;
        // 465 → 隐式 SSL；587/其它 → STARTTLS
        $mail->SMTPSecure = $port === 465 ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        $mail->CharSet    = 'UTF-8';
        $mail->setFrom($user, $fromName !== '' ? $fromName : 'TokenMP');
        $mail->addAddress($to);
        $mail->Subject = 'TokenMP 验证码';
        $mail->isHTML();
        $mail->Body = self::htmlBody($code);

        $mail->send();
        return true;
    }

    /**
     * 读取 system_config 中的 SMTP 配置（value 为 JSONB，字符串带引号，需去引号）。
     * @return array{0:string,1:int,2:string,3:string,4:string} [host, port, user, pass, from]
     */
    private static function smtpConfig(): array
    {
        $rows = Db::connect('pgsql')
            ->table('system_config')
            ->where('key', 'in', ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from'])
            ->column('value', 'key');

        $host     = self::parseValue($rows['smtp_host'] ?? '');
        $user     = self::parseValue($rows['smtp_user'] ?? '');
        $pass     = self::parseValue($rows['smtp_password'] ?? '');
        $fromName = self::parseValue($rows['smtp_from'] ?? '');
        $portRaw  = self::parseValue($rows['smtp_port'] ?? '');
        $port     = $portRaw !== '' ? (int) $portRaw : 587;

        return [$host, $port, $user, $pass, $fromName];
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

    private static function htmlBody(string $code): string
    {
        return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
            . '<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">'
            . '<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;"><tr><td align="center">'
            . '<table width="400" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">'
            . '<tr><td style="background:#000;color:#fff;padding:24px 32px;font-size:20px;font-weight:bold;">TokenMP</td></tr>'
            . '<tr><td style="padding:32px;">'
            . '<p style="margin:0 0 8px;font-size:16px;color:#333;">您的验证码是：</p>'
            . '<p style="margin:0 0 24px;font-size:36px;font-weight:bold;letter-spacing:8px;color:#000;">' . htmlspecialchars($code) . '</p>'
            . '<p style="margin:0;font-size:14px;color:#999;">验证码 5 分钟内有效，请勿泄露给他人。</p>'
            . '</td></tr></table></td></tr></table></body></html>';
    }
}
