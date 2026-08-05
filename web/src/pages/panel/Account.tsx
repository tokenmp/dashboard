import type { ReactNode } from 'react';
import { RefreshCw, Key, Bot, Package } from 'lucide-react';
import {
  getPanelProfileApi,
  getPanelKeysApi,
  getPanelBotKeysApi,
  getPanelPlansApi,
} from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact } from '@/utils/format';
import type { UserBasic, UserApiKeyItem, BotKeyItem, UserPlanItem } from '@/types/user';

function Account() {
  // 自取数据：资料 / API Key / Bot Key / 套餐，一次性并行加载
  const { data, loading, error, reload } = useAsync(async () => {
    const [profile, apiKeys, botKeys, plans] = await Promise.all([
      getPanelProfileApi(),
      getPanelKeysApi(),
      getPanelBotKeysApi(),
      getPanelPlansApi(),
    ]);
    return { profile, apiKeys, botKeys, plans };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">我的账户</h1>
          <p className="mt-1 text-sm text-muted-foreground">资料、密钥与持有的套餐</p>
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
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : data ? (
        <div className="space-y-4">
          <ProfileCard profile={data.profile} />
          <KeySection icon={<Key className="h-3 w-3" />} title="API Key" items={data.apiKeys} render={renderApiKey} />
          <KeySection icon={<Bot className="h-3 w-3" />} title="Bot Key" items={data.botKeys} render={renderBotKey} />
          <PlansCard plans={data.plans} />
        </div>
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
          <Row label="注册时间" value={<span className="font-mono text-xs">{profile.created_at}</span>} />
        </dl>
      </CardContent>
    </Card>
  );
}

/* ------------------------------- 密钥 ------------------------------- */

function KeySection<T extends { id: string }>({
  icon,
  title,
  items,
  render,
}: {
  icon: ReactNode;
  title: string;
  items: T[];
  render: (item: T) => ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5">{icon}{title}（{items.length}）</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState title={`暂无${title}`} />
        ) : (
          <div className="space-y-2">{items.map((item) => render(item))}</div>
        )}
      </CardContent>
    </Card>
  );
}

/** API Key：仅渲染脱敏片段，绝不展示完整密钥 */
function renderApiKey(item: UserApiKeyItem) {
  return (
    <div key={item.id} className="flex items-center justify-between rounded-lg border p-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium">{item.name}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">{item.key_prefix}…{item.key_suffix}</div>
        <div className="text-xs text-muted-foreground">{item.last_used_at ? `最近 ${item.last_used_at}` : '未使用'}</div>
      </div>
      <StatusBadge status={item.status} />
    </div>
  );
}

/** Bot Key：在 API Key 基础上额外展示 scope */
function renderBotKey(item: BotKeyItem) {
  return (
    <div key={item.id} className="flex items-center justify-between rounded-lg border p-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {item.name}
          <Badge variant="secondary" className="text-[10px]">{item.scope}</Badge>
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground">{item.key_prefix}…{item.key_suffix}</div>
        <div className="text-xs text-muted-foreground">{item.last_used_at ? `最近 ${item.last_used_at}` : '未使用'}</div>
      </div>
      <StatusBadge status={item.status} />
    </div>
  );
}

/* ------------------------------- 套餐 ------------------------------- */

function PlansCard({ plans }: { plans: UserPlanItem[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5"><Package className="h-3 w-3" />我的套餐（{plans.length}）</CardTitle>
      </CardHeader>
      <CardContent>
        {plans.length === 0 ? (
          <EmptyState title="暂无套餐" description="你还没有激活任何套餐" />
        ) : (
          <div className="space-y-2">
            {plans.map((p) => (
              <div key={p.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.plan?.name ?? '—'}</span>
                    <Badge variant="outline" className="text-[10px]">{p.plan_type}</Badge>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  生效 {p.activated_at?.slice(0, 10)} · 过期 {p.expires_at?.slice(0, 10) ?? '永久'}
                </div>
                {p.plan && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {p.plan.token_limit != null && <span className="rounded border px-1.5 py-0.5">Token {formatCompact(p.plan.token_limit)}</span>}
                    {p.plan.weekly_limit != null && <span className="rounded border px-1.5 py-0.5">周 {formatCompact(p.plan.weekly_limit)}</span>}
                    {p.plan.monthly_limit != null && <span className="rounded border px-1.5 py-0.5">月 {formatCompact(p.plan.monthly_limit)}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b border-dashed py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

export default Account;
