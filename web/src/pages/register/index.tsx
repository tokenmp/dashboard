import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
import { useAuthStore } from '@/store/auth';
import { getApiError } from '@/utils/error';
import { homePathFor } from '@/utils/redirect';

/**
 * 注册页：邮箱 + 密码（≥8 位）注册，成功即登录并按角色跳转首页。
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

  const handleSubmit = (e: React.FormEvent) => {
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
    // 配置了 register scene 时先过阿里云滑块，通过后携票据提交
    triggerCaptcha((captchaParam) => void doSubmit(captchaParam));
  };

  const doSubmit = async (captchaParam?: string) => {
    setLoading(true);
    try {
      await register(email.trim(), password, captchaParam);
      // token 变化由上面的 useEffect 监听并负责跳转
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <Card className={"w-full rounded-2xl border-white/90 bg-white/90 shadow-[0_20px_50px_-12px_rgba(37,99,235,0.18),0_4px_16px_rgba(15,23,42,0.05)] backdrop-blur"}>
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
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '注册中…' : '注册'}
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
