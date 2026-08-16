import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { BatteryMedium, BookOpen, CalendarClock, ChevronDown, ChevronUp, Gauge, GripVertical, History, Info, Pencil, Plus, RefreshCw, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getPanelProfileApi, updatePanelPlanStrategyApi } from '@/api/panel';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAsync } from '@/hooks/useAsync';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/utils/format';
import type { CodingPlanStrategyKey, UserBasic } from '@/types/user';
import { AccountMobile } from './Account.mobile';

/** 账户页·桌面视图（>=768px）：资料卡 + 计费策略卡（DnD 拖拽调序） */
function AccountDesktop() {
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

/** 策略元数据（与后端枚举一一对应；key 为 CodingPlanStrategyKey 联合类型，禁止任意 string）
 *  emph：差异关键词（菜单中主色加粗，聚焦视觉）；label/hint：完整行为句与后果说明 */
const STRATEGY_META: { key: CodingPlanStrategyKey; label: string; emph: string; hint: string; group: string; dim: string; dir: string }[] = [
  { key: 'soonest_expiry', label: '先用快到期的套餐', emph: '快到期', hint: '即将过期的额度先花掉，避免到期作废', group: '到期', dim: '到期', dir: '最近' },
  { key: 'latest_expiry', label: '先用长期的套餐', emph: '长期', hint: '先消耗有效期长的，短期套餐留着后面用', group: '到期', dim: '到期', dir: '最晚' },
  { key: 'smallest_limit', label: '先用小额度的套餐', emph: '小额度', hint: '先把小额度套餐用完，大额度留着以后慢慢用', group: '限额', dim: '限额', dir: '小' },
  { key: 'largest_limit', label: '先用大额度的套餐', emph: '大额度', hint: '优先消耗大额度套餐，小额度当备用', group: '限额', dim: '限额', dir: '大' },
  { key: 'least_remaining', label: '先用快用完的套餐', emph: '快用完', hint: '先把剩得最少的套餐用光，再换下一个', group: '剩余', dim: '剩余', dir: '最少' },
  { key: 'most_remaining', label: '先用额度充裕的套餐', emph: '额度充裕', hint: '优先消耗剩余最多的套餐', group: '剩余', dim: '剩余', dir: '最多' },
  { key: 'oldest_first', label: '先用最早开通的套餐', emph: '最早', hint: '按开通顺序排队，先开通的先用完', group: '激活', dim: '激活', dir: '先' },
  { key: 'newest_first', label: '先用最新开通的套餐', emph: '最新', hint: '新拿到的套餐先用，旧的留着', group: '激活', dim: '激活', dir: '新' },
];

const ALL_KEYS = STRATEGY_META.map((m) => m.key);
/** 菜单分组顺序（同组两条目相邻展示） */
const GROUP_ORDER = ['到期', '限额', '剩余', '激活'];
/** 分组图标（视觉锚点） */
const GROUP_ICON: Record<string, typeof CalendarClock> = {
  到期: CalendarClock,
  限额: Gauge,
  剩余: BatteryMedium,
  激活: History,
};
const metaOf = (key: CodingPlanStrategyKey) => STRATEGY_META.find((m) => m.key === key)!;
/** 默认策略（与后端 CodingPlanStrategy::DEFAULT_LIST 一致） */
const DEFAULT_ORDER: CodingPlanStrategyKey[] = ['soonest_expiry', 'least_remaining', 'smallest_limit', 'oldest_first'];
/** 把 label 按 emph 关键词切成三段，供加重渲染 */
function splitEmphasis(label: string, emph: string): [string, string, string] {
  const i = label.indexOf(emph);
  if (i < 0) return [label, '', ''];
  return [label.slice(0, i), emph, label.slice(i + emph.length)];
}
/** 可拖拽的策略槽位：⠿ 把手拖动排序（dnd-kit，其他卡片实时让位），
 *  卡片主体点击仍弹菜单切换策略——把手与菜单触发分离，互不干扰 */
function SortableStrategySlot({ rank, meta, visibleGroups, onSet, onRemove }: {
  rank: number;
  meta: (typeof STRATEGY_META)[number];
  visibleGroups: string[];
  onSet: (key: CodingPlanStrategyKey) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: meta.key });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex h-11 items-center gap-1 rounded-lg border border-primary/50 bg-primary/5 pl-1.5 pr-2.5 shadow-sm', isDragging && 'z-10 opacity-70 ring-1 ring-primary/40')}
    >
      <button
        type="button"
        className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/50 hover:bg-muted active:cursor-grabbing"
        title="拖动调整顺序"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{rank}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={meta.hint}>{meta.label}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <StrategyMenuContent visibleGroups={visibleGroups} onSelect={onSet} />
      </DropdownMenu>
      {/* X 与菜单触发器为兄弟节点：嵌套在 trigger 内会导致点击冒泡误开菜单 */}
      <button
        type="button"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-destructive"
        title="移除此策略"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** 移动端策略槽位（v3 ⑩ .slot 样式）：以「上移/下移」按钮替代拖拽调序（触屏 DnD 易误触），
 *  卡片主体点击仍弹菜单切换策略，✕ 移除——交互语义与桌面槽位一致 */
function MobileStrategySlot({ rank, meta, visibleGroups, isFirst, isLast, onSet, onMoveUp, onMoveDown, onRemove }: {
  rank: number;
  meta: (typeof STRATEGY_META)[number];
  visibleGroups: string[];
  isFirst: boolean;
  isLast: boolean;
  onSet: (key: CodingPlanStrategyKey) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-[10px] border bg-card px-1.5 py-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg pl-1 text-left">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-muted text-[10.5px] font-bold text-muted-foreground">{rank}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" title={meta.hint}>{meta.label}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          </button>
        </DropdownMenuTrigger>
        <StrategyMenuContent visibleGroups={visibleGroups} onSelect={onSet} />
      </DropdownMenu>
      <button
        type="button"
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
        title="上移"
        aria-label="上移"
        disabled={isFirst}
        onClick={onMoveUp}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
        title="下移"
        aria-label="下移"
        disabled={isLast}
        onClick={onMoveDown}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {/* X 与菜单触发器为兄弟节点：嵌套在 trigger 内会导致点击冒泡误开菜单 */}
      <button
        type="button"
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] text-muted-foreground/60 transition-colors hover:bg-muted hover:text-destructive"
        title="移除此策略"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** 策略下拉菜单内容：只展示「本槽位维度 + 未被占用的维度」，已占用的整组隐藏。
 *  分组头带图标；条目差异关键词（emph）主色加粗聚焦视觉；限高滚动防溢出。 */
function StrategyMenuContent({ visibleGroups, onSelect }: {
  visibleGroups: string[];
  onSelect: (key: CodingPlanStrategyKey) => void;
}) {
  return (
    <DropdownMenuContent align="start" className="max-h-72 w-72 overflow-y-auto">
      {visibleGroups.flatMap((group) => {
        const Icon = GROUP_ICON[group];
        const items = STRATEGY_META.filter((m) => m.group === group);
        return [
          <DropdownMenuLabel key={`g-${group}`} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {Icon && <Icon className="h-3.5 w-3.5" />}按{group}排序
          </DropdownMenuLabel>,
          ...items.map((m) => {
            const [pre, emph, post] = splitEmphasis(m.label, m.emph);
            return (
              <DropdownMenuItem key={m.key} onClick={() => onSelect(m.key)}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm">
                    {pre}<span className="font-semibold text-primary">{emph}</span>{post}
                  </span>
                  <span className="text-xs text-muted-foreground">{m.hint}</span>
                </span>
              </DropdownMenuItem>
            );
          }),
        ];
      })}
    </DropdownMenuContent>
  );
}

/** 计费策略卡：stored 解析为有序启用列表后编辑/保存。
 *  桌面端用 dnd-kit 拖拽调序；移动端（isMobile）改用槽位右侧「上移/下移」按钮，状态语义完全一致。 */
export function PlanStrategyCard({ stored, onSaved, isMobile }: { stored: string; onSaved: () => void; isMobile?: boolean }) {
  // 解析为有序启用列表；非法内容回退默认（与后端 lenient 解析一致）
  const initial = useMemo(() => {
    const parts = (stored ?? '').split(',').map((k) => k.trim()).filter(Boolean);
    const valid = parts.filter((k): k is CodingPlanStrategyKey => (ALL_KEYS as string[]).includes(k));
    return valid.length > 0 ? Array.from(new Set(valid)) : [...DEFAULT_ORDER];
  }, [stored]);

  const [enabled, setEnabled] = useState<CodingPlanStrategyKey[]>(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // 先决条件：默认只读，点击「编辑」后才开放操作（避免误触，确保用户先理解再操作）
  const [editing, setEditing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

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
  /** 拖拽调序：卡片拖到哪个位置就落哪个位置（dnd-kit 让位动画提供可感知反馈） */
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDirty(true);
    setEnabled((prev) => arrayMove(prev, prev.indexOf(active.id as CodingPlanStrategyKey), prev.indexOf(over.id as CodingPlanStrategyKey)));
  };
  /** 上移/下移调序（移动端按钮入口）：与 handleDragEnd 相同的 arrayMove 重排语义 */
  const moveSlot = (index: number, to: number) => {
    if (to < 0 || to >= enabled.length || to === index) return;
    setDirty(true);
    setEnabled((prev) => arrayMove(prev, index, to));
  };
  // 4px 激活距离：点击（弹菜单）不触发拖拽
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  /** 其他槽位已占用的维度集合 */
  const occupiedGroups = (exceptIndex?: number) =>
    new Set(enabled.filter((_, i) => i !== exceptIndex).map((k) => metaOf(k).group));
  /** 菜单可见分组 = 未被占用的维度（编辑已有槽位时额外包含自己的维度，用于切换方向） */
  const freeGroupsFor = (exceptIndex?: number) => {
    const occupied = occupiedGroups(exceptIndex);
    return GROUP_ORDER.filter((g) => !occupied.has(g));
  };

  const save = async () => {
    if (enabled.length === 0) return toast.error('至少启用一个策略');
    setSaving(true);
    try {
      await updatePanelPlanStrategyApi(enabled.join(','));
      toast.success('扣费策略已保存');
      setDirty(false);
      setEditing(false);
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
      <CardHeader className={cn('flex-row items-center justify-between space-y-0', isMobile ? 'pb-2' : 'pb-3')}>
        <CardTitle className={isMobile ? 'text-[13px] font-semibold' : 'text-sm'}>{isMobile ? '扣费套餐顺序' : '扣费套餐策略'}</CardTitle>
        <div className="flex items-center gap-1.5">
          {isMobile ? (
            /* 移动入口（v3 ⑩）：说明弹窗沿用桌面逻辑，右侧「编辑」为蓝色文字入口，紧凑 h-7 */
            <>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-muted-foreground" onClick={() => setDetailOpen(true)}>
                <Info className="mr-1 h-3.5 w-3.5" />说明
              </Button>
              {editing ? (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={saving} onClick={() => { setEnabled(initial); setDirty(false); setEditing(false); }}>
                  取消
                </Button>
              ) : (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] font-medium text-blue-600" onClick={() => setEditing(true)}>
                  编辑
                </Button>
              )}
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setDetailOpen(true)}>
                <Info className="mr-1 h-3.5 w-3.5" />详情
              </Button>
              {editing ? (
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setEnabled(initial); setDirty(false); setEditing(false); }}>
                  取消编辑
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />编辑
                </Button>
              )}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className={isMobile ? 'space-y-2.5' : 'space-y-4'}>
        {editing ? (
          isMobile ? (
            /* 移动编辑态（v3 ⑩）：仅 ▲▼ 槽位列表；「＋ 添加策略」与「保存」在底部操作行 */
            <div className="space-y-1.5">
              {enabled.map((key, index) => {
                const meta = metaOf(key);
                const free = freeGroupsFor(index);
                const visibleGroups = free.includes(meta.group)
                  ? [meta.group, ...free.filter((g) => g !== meta.group)]
                  : free;
                return (
                  <MobileStrategySlot
                    key={key}
                    rank={index + 1}
                    meta={meta}
                    visibleGroups={visibleGroups}
                    isFirst={index === 0}
                    isLast={index === enabled.length - 1}
                    onSet={(k) => setSlot(index, k)}
                    onMoveUp={() => moveSlot(index, index - 1)}
                    onMoveDown={() => moveSlot(index, index + 1)}
                    onRemove={() => removeSlot(index)}
                  />
                );
              })}
            </div>
          ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={enabled} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {slots.map((slot, i) => {
                if (slot.kind === 'empty') {
                  return <div key={`empty-${i}`} className="h-11 rounded-lg border border-dashed opacity-40" />;
                }
                if (slot.kind === 'add') {
                  const free = freeGroupsFor();
                  if (free.length === 0) return <div key="add-none" className="h-11 rounded-lg border border-dashed opacity-40" />;
                  return (
                    <DropdownMenu key="add">
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5">
                          <Plus className="h-4 w-4" />添加策略
                        </button>
                      </DropdownMenuTrigger>
                      <StrategyMenuContent visibleGroups={free} onSelect={addSlot} />
                    </DropdownMenu>
                  );
                }
                const meta = metaOf(slot.key);
                const free = freeGroupsFor(slot.index);
                const visibleGroups = free.includes(meta.group)
                  ? [meta.group, ...free.filter((g) => g !== meta.group)]
                  : free;
                return (
                  <SortableStrategySlot
                    key={slot.key}
                    rank={slot.index + 1}
                    meta={meta}
                    visibleGroups={visibleGroups}
                    onSet={(key) => setSlot(slot.index, key)}
                    onRemove={() => removeSlot(slot.index)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
          )
        ) : isMobile ? (
          /* 移动只读态：槽位序号列表（数字块 + 弱化文案），视觉与编辑态槽位同构但不带操作 */
          <div className="space-y-1.5">
            {enabled.map((key, i) => {
              const meta = metaOf(key);
              return (
                <div key={key} className="flex items-center gap-2 rounded-[10px] border bg-muted/30 py-1.5 pl-1.5 pr-2.5" title={meta.hint}>
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-muted text-[10.5px] font-bold text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">{meta.label}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            {enabled.map((key, i) => {
              const meta = metaOf(key);
              return (
                <div key={key} className="flex h-11 items-center gap-2 rounded-lg border bg-muted/30 px-2.5" title={meta.hint}>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/15 text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{meta.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {editing && !isMobile && (
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
            {dirty && <span className="text-xs text-amber-600">有未保存的修改</span>}
          </div>
        )}

        {editing && isMobile && (
          /* 移动底部操作行（v3 ⑩ card-actions）：「＋ 添加策略」与「保存」并排等宽；
             可选维度用尽时添加钮禁用占位，保持两列对齐 */
          <div className="space-y-2 border-t pt-2.5">
            <div className="flex gap-1.5">
              {freeGroupsFor().length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border text-[11.5px] text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5">
                      <Plus className="h-3.5 w-3.5" />添加策略
                    </button>
                  </DropdownMenuTrigger>
                  <StrategyMenuContent visibleGroups={freeGroupsFor()} onSelect={addSlot} />
                </DropdownMenu>
              ) : (
                <div className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-dashed text-[11.5px] text-muted-foreground opacity-40">
                  <Plus className="h-3.5 w-3.5" />添加策略
                </div>
              )}
              <Button size="sm" className="h-8 flex-1 rounded-lg px-0 text-xs" disabled={saving || !dirty || enabled.length === 0} onClick={save}>
                {saving ? '保存中…' : '保存'}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-muted-foreground"
                disabled={saving || (enabled.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every((k, i) => enabled[i] === k))}
                title="恢复为系统默认策略顺序"
                onClick={() => { setDirty(true); setEnabled([...DEFAULT_ORDER]); }}
              >
                <RotateCcw className="mr-1 h-3 w-3" />还原默认
              </Button>
              {dirty && <span className="text-[10.5px] text-amber-600">有未保存的修改</span>}
            </div>
          </div>
        )}
      </CardContent>

      {/* 详情弹窗：作用说明、当前顺序、修改方式与规则词典 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>扣费套餐策略说明</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <section className="space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground">一、这是什么</h4>
              <p className="leading-relaxed text-muted-foreground">
                如果你只有一个编程套餐，这里不影响你——所有请求都从它扣额度。
              </p>
              <p className="leading-relaxed text-muted-foreground">
                当你同时拥有多个编程套餐时，每次请求需要决定从哪个套餐扣。这套规则就是做这件事的：<strong className="text-foreground">按 1→4 的顺序依次比较，排在前面的规则先说了算</strong>；只有前面的规则分不出先后（比如两个套餐同一天到期），才看下一条。
              </p>
              <p className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                举例：你的顺序是「先用快到期的 → 先用小额度的」。此时你有一个 3 天后到期的日套餐和一个包月套餐——因为“到期时间”能分出先后，每次请求都会先扣日套餐，直到它用完或过期，包月套餐才会被扣。
              </p>
            </section>
            <section className="space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground">二、你当前的扣费顺序</h4>
              <ol className="space-y-1">
                {enabled.map((k, i) => (
                  <li key={k} className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{i + 1}</span>
                    <span><strong>{metaOf(k).label}</strong><span className="ml-2 text-xs text-muted-foreground">{metaOf(k).hint}</span></span>
                  </li>
                ))}
                {enabled.length === 0 && <li className="text-muted-foreground">未启用任何策略</li>}
              </ol>
            </section>
            <section className="space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground">三、如何修改</h4>
              <p className="leading-relaxed text-muted-foreground">
                当前为仅展示状态，不能操作。点击右上角「编辑」后可以调整：
              </p>
              <table className="w-full text-xs">
                <tbody className="[&_td]:border-b [&_td]:py-1.5">
                  <tr><td className="w-20 text-muted-foreground">调整顺序</td><td>{isMobile ? '点击卡片右侧的 ▲▼ 按钮上下移动' : '按住卡片左侧 ⠿ 拖动，拖到哪就排到哪'}</td></tr>
                  <tr><td className="text-muted-foreground">更换规则</td><td>点击卡片，从弹出菜单里选一条新规则</td></tr>
                  <tr><td className="text-muted-foreground">移除规则</td><td>点击卡片上的 ✕</td></tr>
                  <tr><td className="text-muted-foreground">增加规则</td><td>点击「＋ 添加策略」虚线卡</td></tr>
                </tbody>
              </table>
              <p className="leading-relaxed text-muted-foreground">
                每种规则只能使用一次（比如选了“先用快到期的”，就不能再选“先用长期的”——它们是同一件事的两个方向）。调整完后点击「保存策略」才会生效；「取消编辑」会放弃所有改动。
              </p>
            </section>
            <div className="border-t pt-3">
              <button type="button" className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => setRulesOpen(true)}>
                不确定某条规则的含义？查看全部 8 条规则<BookOpen className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 二级弹窗：全部规则词典 */}
      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>全部规则</DialogTitle></DialogHeader>
          <p className="text-xs leading-relaxed text-muted-foreground">
            每种维度提供两个方向，选其一即可；同一维度在顺序里只能出现一次。
          </p>
          <div className="space-y-3">
            {GROUP_ORDER.map((group) => {
              const Icon = GROUP_ICON[group];
              return (
                <div key={group}>
                  <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                    {Icon && <Icon className="h-3.5 w-3.5" />}按{group}排序
                  </p>
                  <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {STRATEGY_META.filter((m) => m.group === group).map((m) => {
                      const [pre, emph, post] = splitEmphasis(m.label, m.emph);
                      return (
                        <li key={m.key} className="rounded-md border px-2 py-1.5">
                          <span className="text-sm">{pre}<strong className="text-primary">{emph}</strong>{post}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{m.hint}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------- 资料 ------------------------------- */

/** 资料卡：移动端单列铺满（长邮箱/时间更从容），sm 起恢复双列（桌面视觉不变） */
export function ProfileCard({ profile }: { profile: UserBasic }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">我的资料</CardTitle></CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
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

/** 账户页入口：按视口分发桌面/移动视图（移动视图见 Account.mobile.tsx，槽位调序用按钮替代拖拽） */
function Account() {
  const isMobile = useIsMobile();
  return isMobile ? <AccountMobile /> : <AccountDesktop />;
}

export default Account;
