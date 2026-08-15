import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import AuthShell from '@/components/auth/AuthShell';
import { useCaptcha } from '@/hooks/useCaptcha';
import { sendRegisterCodeApi } from '@/api/auth';
import { useAuthStore } from '@/store/auth';
import { getApiError } from '@/utils/error';
import { homePathFor } from '@/utils/redirect';

/** 发码冷却秒数（与后端一致） */
const RESEND_COOLDOWN = 60;

/**
 * 注册页：邮箱真实性认证（对齐旧栈两步注册）。
 * 1. 填邮箱/密码 → 点「发送验证码」（阿里云滑块在这一步，防人机刷邮件）
 * 2. 输入邮箱收到的 6 位验证码 → 「注册」成功即登录按角色跳首页。
 */
function Register() {
  const navigate = useNavigate();
  const { triggerCaptcha, captchaMount, captchaError } = useCaptcha('register');
  const register = useAuthStore((s) => s.register);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 已登录（或注册成功）后按角色跳首页，行为与登录页一致
  useEffect(() => {
    if (!token) return;
    if (user) {
      navigate(homePathFor(user.role), { replace: true });
    } else {
      fetchUser();
    }
  }, [token, user, navigate, fetchUser]);

  // 发码冷却倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  /** 发送验证码：先过滑块再提交（防人机刷邮件；已注册邮箱后端防枚举静默） */
  const handleSendCode = () => {
    setError('');
    if (!email.trim()) {
      setError('请先填写邮箱');
      return;
    }
    triggerCaptcha((captchaParam) => void doSendCode(captchaParam));
  };

  const doSendCode = async (captchaParam?: string) => {
    setSending(true);
    try {
      await sendRegisterCodeApi(email.trim(), captchaParam);
      setCodeSent(true);
      setCountdown(RESEND_COOLDOWN);
      toast.success('验证码已发送，请查收邮箱（5 分钟内有效）');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('密码至少 8 位');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    if (!emailCode.trim()) {
      setError('请输入邮箱验证码');
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password, emailCode.trim());
      // token 变化由上面的 useEffect 监听并负责跳转
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <Card className="w-full rounded-2xl border-white/90 bg-white/90 shadow-[0_20px_50px_-12px_rgba(37,99,235,0.18),0_4px_16px_rgba(15,23,42,0.05)] backdrop-blur">
        <CardHeader>
          <CardTitle>注册</CardTitle>
          <CardDescription>注册 TokenMP 账号，开始使用全部模型</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="至少 8 位"
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">确认密码</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailCode">邮箱验证码</Label>
              <div className="flex gap-2">
                <Input
                  id="emailCode"
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  placeholder="6 位数字"
                  autoComplete="one-time-code"
                  disabled={loading}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  disabled={sending || countdown > 0}
                  onClick={handleSendCode}
                >
                  {sending
                    ? '发送中…'
                    : countdown > 0
                      ? `${countdown}s 后重发`
                      : codeSent
                        ? '重新发送'
                        : '发送验证码'}
                </Button>
              </div>
              {codeSent && countdown <= 0 && (
                <p className="text-xs text-muted-foreground">没收到？请检查垃圾箱或重发</p>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading || !codeSent}>
              {loading ? '注册中…' : codeSent ? '注册' : '请先发送邮箱验证码'}
            </Button>
            <p className="text-sm text-muted-foreground">
              已有账号？{' '}
              <Link to="/login" className="hover:underline">
                直接登录
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
      {captchaError && <p className="mt-3 text-center text-sm text-destructive">{captchaError}</p>}
      {captchaMount}
    </AuthShell>
  );
}

export default Register;
