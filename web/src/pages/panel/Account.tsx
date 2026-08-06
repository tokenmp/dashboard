import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { getPanelProfileApi } from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/utils/format';
import type { UserBasic } from '@/types/user';

function Account() {
  // 自取数据：资料
  const { data, loading, error, reload } = useAsync(async () => {
    const profile = await getPanelProfileApi();
    return { profile };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">我的账户</h1>
          <p className="mt-1 text-sm text-muted-foreground">个人资料</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : data ? (
        <ProfileCard profile={data.profile} />
      ) : null}
    </div>
  );
}

/* ------------------------------- 资料 ------------------------------- */

function ProfileCard({ profile }: { profile: UserBasic }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">我的资料</CardTitle></CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Row label="邮箱" value={profile.email} />
          <Row label="角色" value={<Badge variant={profile.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">{profile.role}</Badge>} />
          <Row label="状态" value={<StatusBadge status={profile.status} />} />
          <Row label="首选计费" value={profile.preferred_billing} />
          <Row label="回退计费" value={profile.fallback_enabled ? '是' : '否'} />
          <Row label="注册时间" value={<span className="font-mono text-xs">{formatDateTime(profile.created_at)}</span>} />
        </dl>
      </CardContent>
    </Card>
  );
}

/* ------------------------------- 密钥 ------------------------------- */

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b border-dashed py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

export default Account;
