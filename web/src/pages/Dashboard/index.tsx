import { useEffect, useState } from 'react';
import { getUserApi } from '@/api/auth';
import { getApiError } from '@/utils/error';
import type { UserInfo } from '@/types';

function Dashboard() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getUserApi()
      .then((u) => {
        if (active) setUser(u);
      })
      .catch((e) => {
        if (active) setError(getApiError(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        {loading ? '加载中…' : user ? `欢迎，${user.username}` : 'Dashboard'}
      </h1>
      <p className="text-muted-foreground">这是受保护的 Dashboard 首页，仅登录后可访问。</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {user && (
        <pre className="rounded bg-muted p-4 text-sm">
          {JSON.stringify(user, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default Dashboard;
