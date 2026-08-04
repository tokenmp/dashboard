import { RefreshCw, KeyRound, Bot, Package, UserCircle } from 'lucide-react';
import { getMyProfileApi, getMyKeysApi, getMyBotKeysApi, getMyPlansApi } from '@/api/user';
import { useAsync } from '@/hooks/useAsync';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact, formatNumber } from '@/utils/format';

function Account() {
  const { data: profile, loading: lp, error: ep, reload: rp } = useAsync(getMyProfileApi);
  const { data: keys, loading: lk, reload: rk } = useAsync(getMyKeysApi);
  const { data: botKeys, loading: lb, reload: rb } = useAsync(getMyBotKeysApi);
  const { data: plans, loading: lpl, reload: rpl } = useAsync(getMyPlansApi);

  const reloadAll = () => { rp(); rk(); rb(); rpl(); };
  const loading = lp || lk || lb || lpl;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">账户中心</h1>
          <p className="mt-1 text-sm text-muted-foreground">我的资料、密钥与套餐</p>
        </div>
        <Button variant="outline" size="sm" onClick={reloadAll} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
        </Button>
      </div>

      {ep && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{ep}</CardContent></Card>}

      {/* 资料 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><UserCircle className="h-4 w-4" />我的资料</CardTitle></CardHeader>
        <CardContent>
          {lp ? <Skeleton className="h-24 w-full" /> : profile ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-3">
              <Field label="邮箱" value={profile.email} />
              <Field label="角色" value={<Badge variant={profile.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">{profile.role}</Badge>} />
              <Field label="状态" value={<StatusBadge status={profile.status} />} />
              <Field label="首选计费" value={profile.preferred_billing} />
              <Field label="回退计费" value={profile.fallback_enabled ? '是' : '否'} />
              <Field label="注册时间" value={<span className="font-mono text-xs">{profile.created_at}</span>} />
            </dl>
          ) : null}
        </CardContent>
      </Card>

      {/* API Key */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><KeyRound className="h-4 w-4" />API Key（{keys?.length ?? 0}）</CardTitle></CardHeader>
        <CardContent>
          {lk ? <Skeleton className="h-16 w-full" /> : keys && keys.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between rounded-lg border p-2.5">
                  <div>
                    <div className="text-sm font-medium">{k.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{k.key_prefix}…{k.key_suffix}</div>
                    <div className="text-xs text-muted-foreground">{k.last_used_at ? `最近 ${k.last_used_at}` : '未使用'}</div>
                  </div>
                  <StatusBadge status={k.status} />
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">暂无 API Key</p>}
        </CardContent>
      </Card>

      {/* Bot Key */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Bot className="h-4 w-4" />Bot Key（{botKeys?.length ?? 0}）</CardTitle></CardHeader>
        <CardContent>
          {lb ? <Skeleton className="h-16 w-full" /> : botKeys && botKeys.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {botKeys.map((k) => (
                <div key={k.id} className="flex items-center justify-between rounded-lg border p-2.5">
                  <div>
                    <div className="text-sm font-medium">{k.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{k.key_prefix}…{k.key_suffix}</div>
                    <div className="text-xs text-muted-foreground">scope: {k.scope}</div>
                  </div>
                  <StatusBadge status={k.status} />
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">暂无 Bot Key</p>}
        </CardContent>
      </Card>

      {/* 套餐 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Package className="h-4 w-4" />我的套餐（{plans?.length ?? 0}）</CardTitle></CardHeader>
        <CardContent>
          {lpl ? <Skeleton className="h-24 w-full" /> : plans && plans.length > 0 ? (
            <div className="space-y-2">
              {plans.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border p-2.5">
                  <div>
                    <div className="text-sm font-medium">{p.plan?.name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      <Badge variant="outline" className="mr-1 text-[10px]">{p.plan_type}</Badge>
                      生效 {p.activated_at?.slice(0, 10)} · 过期 {p.expires_at?.slice(0, 10) ?? '永久'}
                      {p.plan?.token_limit ? ` · 额度 ${formatCompact(p.plan.token_limit)}` : ''}
                      {p.plan?.monthly_limit ? ` · 总限 ${formatNumber(p.plan.monthly_limit)}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">暂无套餐</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b border-dashed py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

export default Account;
