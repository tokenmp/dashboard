import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { getPanelProfileApi } from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MobileCard, MobilePageHeader } from '@/components/mobile';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/format';
import type { UserBasic } from '@/types/user';
import { PlanStrategyCard } from './Account';

/**
 * 账户页·移动视图（<768px，v3 ⑩ 定稿）：拆为两张独立卡——
 * ①「账户资料」卡：字段两列网格（ProfileCard 现有真实字段，11px 紧凑排版）；
 * ②「扣费套餐顺序」卡：复用 Account.tsx 的 PlanStrategyCard（isMobile 分支），
 *    编辑态 ▲▼ 槽位列表 +「＋ 添加策略」+「保存」，状态逻辑与桌面完全一致。
 */
export function AccountMobile() {
  // 自取数据：资料
  const { data, loading, error, reload } = useAsync(async () => {
    const profile = await getPanelProfileApi();
    return { profile };
  });

  return (
    <div className="space-y-3">
      <MobilePageHeader
        title="我的账户"
        action={
          <Button variant="outline" size="sm" className="h-[30px] rounded-lg px-2.5" onClick={reload} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        }
      />

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-2.5 text-[13px] text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-[7px]">
          <Skeleton className="h-[132px] w-full rounded-xl" />
          <Skeleton className="h-[196px] w-full rounded-xl" />
        </div>
      ) : data ? (
        <>
          <ProfileCardMobile profile={data.profile} />
          <PlanStrategyCard stored={data.profile.coding_plan_strategy} onSaved={reload} isMobile />
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------- 资料卡 ------------------------------- */

/** 账户资料卡·移动端：标题 + 字段两列网格（字段与桌面 ProfileCard 同源，均为 UserBasic 真实字段）。
 *  邮箱/注册时间跨整行（长值更从容），角色/状态/计费字段两列排布。 */
function ProfileCardMobile({ profile }: { profile: UserBasic }) {
  return (
    <MobileCard title="账户资料">
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <ProfileField className="col-span-2" label="邮箱" value={profile.email} />
        <ProfileField label="角色" value={<Badge variant={profile.role === 'admin' ? 'default' : 'secondary'} className="px-1.5 py-0 text-[10.5px]">{profile.role}</Badge>} />
        <ProfileField label="状态" value={<StatusBadge status={profile.status} className="px-1.5 py-0 text-[10.5px]" />} />
        <ProfileField label="首选计费" value={profile.preferred_billing} />
        <ProfileField label="回退计费" value={profile.fallback_enabled ? '是' : '否'} />
        <ProfileField className="col-span-2" label="注册时间" value={<span className="font-mono">{formatDateTime(profile.created_at)}</span>} />
      </div>
    </MobileCard>
  );
}

/** 资料字段单元格：11px label(muted) + value（超长截断、表格数字），className 用于跨列。 */
function ProfileField({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 gap-1.5 text-[11px] leading-[1.5]', className)}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate tabular-nums">{value}</span>
    </div>
  );
}

export default AccountMobile;
