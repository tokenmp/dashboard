import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, Plus, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { getPanelProfileApi, updatePanelPlanStrategyApi } from '@/api/panel';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
  { key: 'soonest_expiry', label: '最近到期优先', hint: '快过期的先用，避免浪费', group: '到期' },
  { key: 'latest_expiry', label: '最晚到期优先', hint: '长期套餐先垫着用', group: '到期' },
  { key: 'smallest_limit', label: '限额小优先', hint: '先消耗小套餐', group: '限额' },
  { key: 'largest_limit', label: '限额大优先', hint: '先扣限额大的套餐', group: '限额' },
  { key: 'least_remaining', label: '剩余最少优先', hint: '把快用完的打满再换新', group: '剩余' },
  { key: 'most_remaining', label: '剩余最多优先', hint: '先用富余的套餐', group: '剩余' },
  { key: 'oldest_first', label: '先激活先用', hint: 'FIFO，把已开通的用完', group: '激活' },
  { key: 'newest_first', label: '最新激活先用', hint: '优先新套餐', group: '激活' },
];

const ALL_KEYS = STRATEGY_META.map((m) => m.key);
const metaOf = (key: CodingPlanStrategyKey) => STRATEGY_META.find((m) => m.key === key)!;
/** 默认策略（与后端 CodingPlanStrategy::DEFAULT_LIST 一致） */
const DEFAULT_ORDER: CodingPlanStrategyKey[] = ['soonest_expiry', 'smallest_limit', 'least_remaining', 'oldest_first'];
/** 策略下拉菜单内容：可切换为任一未被其他槽位占用的策略；filled 槽位额外提供移除 */
function StrategyMenuContent({ excludeKeys, onSelect, onRemove }: {
  excludeKeys: CodingPlanStrategyKey[];
  onSelect: (key: CodingPlanStrategyKey) => void;
  onRemove?: () => void;
}) {
  return (
    <DropdownMenuContent align="start" className="w-64">
      <DropdownMenuLabel>选择策略</DropdownMenuLabel>
      {STRATEGY_META.map((m) => {
        const used = excludeKeys.includes(m.key);
        return (
          <DropdownMenuItem key={m.key} disabled={used} onClick={() => onSelect(m.key)}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm">{m.label}{used ? '（已启用）' : ''}</span>
              <span className="text-xs text-muted-foreground">{m.hint}</span>
            </span>
            <span className="ml-2 shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">{m.group}</span>
          </DropdownMenuItem>
        );
      })}
      {onRemove && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onRemove}>移除此条</DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  );
}

function PlanStrategyCard({ stored, onSaved }: { stored: string; onSaved: () => void }) {
  // 解析为有序启用列表；非法内容回退默认（与后端 lenient 解析一致）
  const initial = useMemo(() => {
    const parts = (stored ?? '').split(',').map((k) => k.trim()).filter(Boolean);
    const valid = parts.filter((k): k is CodingPlanStrategyKey => (ALL_KEYS as string[]).includes(k));
    return valid.length > 0 ? Array.from(new Set(valid)) : [...DEFAULT_ORDER];
  }, [stored]);

  const [enabled, setEnabled] = useState<CodingPlanStrategyKey[]>(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const setSlot = (index: number, key: CodingPlanStrategyKey) => {
    setDirty(true);
    setEnabled((prev) => prev.map((k, i) => (i === index ? key : k)));
  };
  const addSlot = (key: CodingPlanStrategyKey) => {
    setDirty(true);
    setEnabled((prev) => [...prev, key]);
  };
  const removeSlot = (index: number) => {
    setDirty(true);
    setEnabled((prev) => prev.filter((_, i) => i !== index));
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

  // 一行四列：前 N 格 = 生效策略（点击下拉切换），第 N+1 格 = 添加，其余占位
  const slots: ({ kind: 'filled'; index: number; key: CodingPlanStrategyKey } | { kind: 'add' } | { kind: 'empty' })[] = [
    ...enabled.map((key, index) => ({ kind: 'filled' as const, index, key })),
    { kind: 'add' as const },
    ...Array.from({ length: Math.max(0, 3 - enabled.length) }, () => ({ kind: 'empty' as const })),
  ].slice(0, 4);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">扣费套餐策略</CardTitle>
        <p className="text-xs text-muted-foreground">
          多个编程套餐共存时，按 1→4 的顺序依次决定先扣哪个套餐（前者持平再比后者）。点击卡片可切换该位置的策略。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {slots.map((slot, i) => {
            if (slot.kind === 'empty') {
              return <div key={`empty-${i}`} className="min-h-[7.5rem] rounded-lg border border-dashed opacity-40" />;
            }
            if (slot.kind === 'add') {
              return (
                <DropdownMenu key="add">
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="flex min-h-[7.5rem] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed p-3 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted"><Plus className="h-4 w-4" /></span>
                      <span className="text-xs">添加策略</span>
                    </button>
                  </DropdownMenuTrigger>
                  <StrategyMenuContent excludeKeys={enabled} onSelect={addSlot} />
                </DropdownMenu>
              );
            }
            const meta = metaOf(slot.key);
            return (
              <DropdownMenu key={slot.key}>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex min-h-[7.5rem] flex-col items-start gap-1 rounded-lg border border-primary/50 bg-primary/5 p-3 text-left shadow-sm transition-colors hover:border-primary">
                    <span className="flex w-full items-center justify-between">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{slot.index + 1}</span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <span className="text-sm font-medium">{meta.label}</span>
                    <span className="text-xs leading-snug text-muted-foreground">{meta.hint}</span>
                  </button>
                </DropdownMenuTrigger>
                <StrategyMenuContent
                  excludeKeys={enabled.filter((_, idx) => idx !== slot.index)}
                  onSelect={(key) => setSlot(slot.index, key)}
                  onRemove={() => removeSlot(slot.index)}
                />
              </DropdownMenu>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <Button size="sm" disabled={saving || !dirty || enabled.length === 0} onClick={save}>{saving ? '保存中…' : '保存策略'}</Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={saving || (enabled.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every((k, i) => enabled[i] === k))}
            title="恢复为系统默认策略顺序"
            onClick={() => { setDirty(true); setEnabled([...DEFAULT_ORDER]); }}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />还原默认
          </Button>
          <span className="font-mono text-[11px] text-muted-foreground">当前顺序：{enabled.length > 0 ? enabled.map((k) => metaOf(k).label).join(' → ') : '—'}</span>
          {dirty && <span className="text-xs text-amber-600">有未保存的修改</span>}
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
