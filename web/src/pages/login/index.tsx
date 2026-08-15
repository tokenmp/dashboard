import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
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
import { safeRedirect, homePathFor } from '@/utils/redirect';

function Login() {
  const navigate = useNavigate();
  const { triggerCaptcha, captchaMount, captchaError } = useCaptcha('login');
  const [searchParams] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  // 显式回跳地址（来自 ?redirect=，经安全校验）；为空则登录后按角色跳首页
  const requestedRedirect = searchParams.get('redirect');
  const redirectTarget = requestedRedirect ? safeRedirect(requestedRedirect) : null;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 登录成功（或已登录访问本页）后跳转：有显式 redirect 用之，否则按角色跳首页
  useEffect(() => {
    if (!token) return;
    if (redirectTarget) {
      navigate(redirectTarget, { replace: true });
      return;
    }
    // 无显式回跳：等用户信息就绪后按角色跳首页
    if (user) {
      navigate(homePathFor(user.role), { replace: true });
    } else {
      fetchUser();
    }
  }, [token, user, redirectTarget, navigate, fetchUser]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // 配置了 login scene 时先过阿里云滑块，通过后携票据提交
    triggerCaptcha((captchaParam) => void doSubmit(captchaParam));
  };

  const doSubmit = async (captchaParam?: string) => {
    setError('');
    setLoading(true);
    try {
      await login(username, password, captchaParam);
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
          <CardTitle>登录</CardTitle>
          <CardDescription>欢迎回来，请登录你的账号</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">账号</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="邮箱地址"
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
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={loading}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? '登录中…' : '登 录'}
            </Button>
            <div className="flex w-full items-center justify-between text-sm">
              <Link to="/forgot-password" className="text-muted-foreground hover:underline">
                忘记密码？
              </Link>
              <Link to="/register" className="text-muted-foreground hover:underline">
                没有账号？免费注册
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
      {captchaError && <p className="mt-3 text-center text-sm text-destructive">{captchaError}</p>}
      {captchaMount}
    </AuthShell>
  );
}

export default Login;
