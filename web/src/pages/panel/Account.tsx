import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { GripVertical, Plus, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getPanelProfileApi, updatePanelPlanStrategyApi } from '@/api/panel';
import { cn } from '@/lib/utils';
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

/** 可拖拽的策略条目（dnd-kit useSortable：支持鼠标/触屏/键盘） */
function SortableStrategyItem({ rank, meta, onRemove }: { rank: number; meta: (typeof STRATEGY_META)[number]; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: meta.key });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-2.5 pl-2 shadow-sm',
        isDragging && 'z-10 opacity-70 shadow-md ring-1 ring-primary/40',
      )}
    >
      <button
        type="button"
        className="flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/50 hover:bg-muted active:cursor-grabbing"
        title="拖动调整优先级"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{meta.label}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta.hint}</span>
      </span>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" title="移除" onClick={onRemove}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}

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

  // PointerSensor 带 4px 激活距离：避免误触点击；KeyboardSensor 提供无障碍排序
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const disabledList = STRATEGY_META.filter((m) => !enabled.includes(m.key));

  const add = (key: CodingPlanStrategyKey) => {
    setDirty(true);
    setEnabled((prev) => [...prev, key]);
  };
  const remove = (key: CodingPlanStrategyKey) => {
    setDirty(true);
    setEnabled((prev) => prev.filter((k) => k !== key));
  };
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDirty(true);
    setEnabled((prev) => {
      const from = prev.indexOf(active.id as CodingPlanStrategyKey);
      const to = prev.indexOf(over.id as CodingPlanStrategyKey);
      return arrayMove(prev, from, to);
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
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">扣费套餐策略</CardTitle>
        <p className="text-xs text-muted-foreground">
          多个编程套餐共存时，按「生效顺序」依次决定先扣哪个套餐（前者持平再比后者）。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {/* 生效顺序：拖拽排序 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">生效顺序</p>
              {enabled.length > 1 && <p className="text-[11px] text-muted-foreground">按住 ⠿ 拖动调整</p>}
            </div>
            {enabled.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                未启用任何策略，请从右侧添加
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={enabled} strategy={verticalListSortingStrategy}>
                  <ol className="space-y-1.5">
                    {enabled.map((key, i) => (
                      <SortableStrategyItem key={key} rank={i + 1} meta={metaOf(key)} onRemove={() => remove(key)} />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
            )}
          </section>

          {/* 未启用：点击添加 */}
          <section className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">未启用（点击添加）</p>
            {disabledList.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">全部策略均已启用</div>
            ) : (
              <div className="grid gap-1.5">
                {disabledList.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => add(m.key)}
                    className="group flex items-center gap-2.5 rounded-lg border border-dashed p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{m.hint}</span>
                    </span>
                    <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">{m.group}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <Button size="sm" disabled={saving || !dirty || enabled.length === 0} onClick={save}>{saving ? '保存中…' : '保存策略'}</Button>
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
