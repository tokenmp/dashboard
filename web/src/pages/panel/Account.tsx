import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowLeftRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getPanelProfileApi, updatePanelPlanStrategyApi } from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/utils/format';
import type { CodingPlanStrategyKey, UserBasic } from '@/types/user';

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
        <>
          <ProfileCard profile={data.profile} />
          <PlanStrategyCard stored={data.profile.coding_plan_strategy} onSaved={reload} />
        </>
      ) : null}
    </div>
  );
}

/* --------------------------- 扣费套餐策略 --------------------------- */

/** 策略元数据（与后端枚举一一对应；key 为 CodingPlanStrategyKey 联合类型，禁止任意 string） */
const STRATEGY_META: { key: CodingPlanStrategyKey; label: string; hint: string; group: string }[] = [
  { key: 'largest_limit', label: '限额大优先', hint: '先扣限额大的套餐', group: '限额' },
  { key: 'smallest_limit', label: '限额小优先', hint: '先消耗小套餐', group: '限额' },
  { key: 'least_remaining', label: '剩余最少优先', hint: '把快用完的打满再换新', group: '剩余' },
  { key: 'most_remaining', label: '剩余最多优先', hint: '先用富余的套餐', group: '剩余' },
  { key: 'soonest_expiry', label: '最近到期优先', hint: '快过期的先用，避免浪费', group: '到期' },
  { key: 'latest_expiry', label: '最晚到期优先', hint: '长期套餐先垫着用', group: '到期' },
  { key: 'oldest_first', label: '先激活先用', hint: 'FIFO，把已开通的用完', group: '激活' },
  { key: 'newest_first', label: '最新激活先用', hint: '优先新套餐', group: '激活' },
];

const ALL_KEYS = STRATEGY_META.map((m) => m.key);

function PlanStrategyCard({ stored, onSaved }: { stored: string; onSaved: () => void }) {
  // 解析为有序启用列表；非法内容回退默认（与后端 lenient 解析一致）
  const initial = useMemo(() => {
    const parts = (stored ?? '').split(',').map((k) => k.trim()).filter(Boolean);
    const valid = parts.filter((k): k is CodingPlanStrategyKey => (ALL_KEYS as string[]).includes(k));
    return valid.length > 0 ? Array.from(new Set(valid)) : (['soonest_expiry', 'smallest_limit', 'least_remaining', 'oldest_first'] as CodingPlanStrategyKey[]);
  }, [stored]);

  const [enabled, setEnabled] = useState<CodingPlanStrategyKey[]>(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const toggle = (key: CodingPlanStrategyKey) => {
    setDirty(true);
    setEnabled((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= enabled.length) return;
    setDirty(true);
    setEnabled((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async () => {
    if (enabled.length === 0) return toast.error('至少启用一个策略');
    setSaving(true);
    try {
      await updatePanelPlanStrategyApi(enabled.join(','));
      toast.success('扣费策略已保存');
      setDirty(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">扣费套餐策略</CardTitle>
        <p className="text-xs text-muted-foreground">
          多个编程套餐共存时，按下方已启用策略的先后顺序决定先扣哪个套餐（前者持平再比后者）。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STRATEGY_META.map((m) => {
            const active = enabled.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggle(m.key)}
                className={`flex items-center justify-between rounded-lg border p-2.5 text-left text-sm transition-colors ${active ? 'border-primary/60 bg-primary/5' : 'hover:bg-muted/60'}`}
              >
                <span>
                  <span className="font-medium">{m.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{m.hint}</span>
                </span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{active ? `#${enabled.indexOf(m.key) + 1}` : '未启用'}</span>
              </button>
            );
          })}
        </div>

        {enabled.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">生效顺序（上方调优先级）</p>
            {enabled.map((key, i) => {
              const meta = STRATEGY_META.find((m) => m.key === key)!;
              return (
                <div key={key} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                  <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                  <span className="font-medium">{meta.label}</span>
                  <span className="ml-auto flex gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => move(i, -1)} title="上移"><ArrowDown className="h-3.5 w-3.5 rotate-180" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={i === enabled.length - 1} onClick={() => move(i, 1)} title="下移"><ArrowDown className="h-3.5 w-3.5" /></Button>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button size="sm" disabled={saving || !dirty || enabled.length === 0} onClick={save}>{saving ? '保存中…' : '保存策略'}</Button>
          {dirty && <span className="text-xs text-muted-foreground"><ArrowLeftRight className="mr-1 inline h-3 w-3" />有未保存的修改</span>}
        </div>
      </CardContent>
    </Card>
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
