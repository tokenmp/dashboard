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
import { useAuthStore } from '@/store/auth';
import { getApiError } from '@/utils/error';
import { safeRedirect, homePathFor } from '@/utils/redirect';

function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  // 显式回跳地址（来自 ?redirect=，经安全校验）；为空则登录后按角色跳首页
  const requestedRedirect = searchParams.get('redirect');
  const redirectTarget = requestedRedirect ? safeRedirect(requestedRedirect) : null;

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      // token 变化由上面的 useEffect 监听并负责跳转
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>登录</CardTitle>
          <CardDescription>TokenMP Dashboard（演示账号 admin / admin）</CardDescription>
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
                disabled={loading}
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
                disabled={loading}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '登录中…' : '登录'}
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
    </div>
  );
}

export default Login;
