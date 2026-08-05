import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { sendResetCodeApi, resetPasswordApi } from '@/api/auth';
import { useMutation } from '@/hooks/useMutation';

/**
 * 找回密码（公开页）：两步
 *   1. 输入注册邮箱 → 发送 6 位验证码（5 分钟有效，防枚举始终提示已发送）
 *   2. 输入验证码 + 新密码 → 重置（成功后旧会话全部吊销，跳回登录页）
 *
 * 新密码经一次性 RSA-OAEP 公钥加密传输（与登录一致）。
 */
function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const { loading: sending, mutate: sendMut } = useMutation();
  const { loading: resetting, mutate: resetMut } = useMutation();

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    await sendMut(() => sendResetCodeApi(email), {
      successMsg: '验证码已发送，请查收邮箱（5 分钟内有效）',
      onSuccess: () => setStep(2),
    });
  };

  const handleReset = async (e: React.FormEvent) => {
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
    await resetMut(() => resetPasswordApi(email, code, password), {
      successMsg: '密码已重置，请使用新密码登录',
      onSuccess: () => navigate('/login', { replace: true }),
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>找回密码</CardTitle>
          <CardDescription>
            {step === 1 ? '输入注册邮箱获取验证码' : '输入收到的验证码与新密码'}
          </CardDescription>
        </CardHeader>
        {step === 1 ? (
          <form onSubmit={handleSend}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={sending}
                  autoComplete="email"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? '发送中…' : '发送验证码'}
              </Button>
              <Link to="/login" className="text-sm text-muted-foreground hover:underline">
                返回登录
              </Link>
            </CardFooter>
          </form>
        ) : (
          <form onSubmit={handleReset}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">验证码</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  disabled={resetting}
                  placeholder="6 位数字"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">新密码</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={resetting}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">确认新密码</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  disabled={resetting}
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={resetting}>
                {resetting ? '重置中…' : '重置密码'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setStep(1)}
                disabled={resetting}
              >
                返回上一步
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}

export default ForgotPassword;
