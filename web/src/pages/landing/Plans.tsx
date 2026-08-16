import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSitePlansApi } from '@/api/site';
import { useIsMobile } from '@/hooks/use-is-mobile';
import type { SitePlan } from '@/types/site';
import { PlanCard, PlanCardMobile } from './Home';

/**
 * 套餐页：数据来自公开接口 /api/v1/site/plans。
 * 顶部一行筛选栏：左侧切换计费方式（按次 / 按 Token），右侧切换分类
 * （日卡 / 月卡 / 永久按量…，随计费方式独立变化）；
 * 下方以卡片网格平铺当前筛选结果。
 * 计费规则与额度换算示例在「常见问题」（/faq#billing）。
 */

/** 套餐类型展示顺序与标题 */
const PLAN_TYPES: Array<{ type: string; label: string; sub: string }> = [
  { type: 'coding', label: '按请求次数', sub: '按「模型倍率 × 调用次数」扣减额度' },
  { type: 'token', label: '按 Token', sub: '按 Token 消耗扣减额度' },
  { type: 'image', label: '按图像', sub: '按图像生成消耗扣减额度' },
];

/** 已知分类的标签与排序（后台 category 为展示用自由字符串，未知值归入「其他」） */
const CATEGORY_ORDER = ['daily', 'day', 'week', 'month', 'permanent', 'custom'];
const CATEGORY_LABELS: Record<string, string> = {
  daily: '日卡',
  day: '日卡',
  week: '周卡',
  month: '月卡',
  permanent: '永久 / 按量',
  custom: '定制',
};

function categoryLabel(category: string | null): string {
  if (!category) return '其他';
  return CATEGORY_LABELS[category] ?? '其他';
}

function categoryKey(category: string | null): string {
  if (!category) return 'zz';
  const i = CATEGORY_ORDER.indexOf(category);
  return i >= 0 ? String(i).padStart(2, '0') : `zz-${category}`;
}

export default function Plans() {
  const isMobile = useIsMobile();
  const [plans, setPlans] = useState<SitePlan[] | null>(null);
  const [type, setType] = useState('');
  /** 每个计费类型各自选中的分类 key（切换类型后回到该类型的首个分类） */
  const [categoryByType, setCategoryByType] = useState<Record<string, string>>({});

  useEffect(() => {
    getSitePlansApi()
      .then(setPlans)
      .catch(() => setPlans([]));
  }, []);

  // 数据就绪后默认选中第一个有套餐的类型
  useEffect(() => {
    if (type || !plans) return;
    const first = PLAN_TYPES.find((t) => plans.some((p) => p.plan_type === t.type));
    if (first) setType(first.type);
  }, [plans, type]);

  const typeTabs = useMemo(
    () => PLAN_TYPES.filter((t) => (plans ?? []).some((p) => p.plan_type === t.type)),
    [plans],
  );

  // 当前类型下的分类（唯一分类时不显示右侧分类筛选）
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of (plans ?? []).filter((x) => x.plan_type === type)) {
      const key = categoryKey(p.category);
      if (!seen.has(key)) seen.set(key, categoryLabel(p.category));
    }
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [plans, type]);

  const activeCategory =
    categoryByType[type] && categories.some(([key]) => key === categoryByType[type])
      ? categoryByType[type]
      : categories[0]?.[0];

  const activeMeta = typeTabs.find((t) => t.type === type);
  const visible = useMemo(
    () =>
      (plans ?? [])
        .filter((p) => p.plan_type === type && categoryKey(p.category) === activeCategory)
        .sort((a, b) => a.price - b.price),
    [plans, type, activeCategory],
  );

  // 移动端专属分支（v3 ⑰ 定稿）：筛选改紧凑分段控件 + 横滑分类 chips，套餐卡单列纵向（推荐蓝描边 + 角标 + 全宽 CTA），桌面网格不渲染
  if (isMobile) {
    return (
      <main className="pb-1">
        {plans === null ? (
          <p className="mx-3.5 mt-4 rounded-[12px] border border-dashed border-zinc-200 px-4 py-8 text-center text-xs text-zinc-400">
            加载中…
          </p>
        ) : typeTabs.length === 0 ? (
          <p className="mx-3.5 mt-4 rounded-[12px] border border-dashed border-zinc-200 px-4 py-8 text-center text-xs text-zinc-400">
            暂无在售套餐
          </p>
        ) : (
          <>
            {/* 页头：标题 + 副文（与首页套餐区块口径一致） */}
            <div className="px-4 pt-4">
              <h1 className="text-[19px] font-extrabold tracking-tight text-zinc-900">简单透明的定价</h1>
              <p className="mt-1.5 text-[12.5px] text-zinc-500">套餐额度随周期自动重置，随时可用兑换码补充。</p>
            </div>

            {/* 计费方式：全宽分段控件 */}
            <div className="mt-3 px-4">
              <div className="flex rounded-[10px] bg-zinc-100 p-[3px]">
                {typeTabs.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => setType(t.type)}
                    className={`flex-1 cursor-pointer rounded-[8px] py-[6px] text-xs font-medium transition ${
                      type === t.type ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 分类 chips：横滑，隐藏滚动条 */}
            {categories.length > 1 && (
              <div className="mt-2.5 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {categories.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategoryByType((prev) => ({ ...prev, [type]: key }))}
                    className={`h-[26px] shrink-0 cursor-pointer rounded-full px-2.5 text-[11.5px] transition ${
                      activeCategory === key
                        ? 'bg-zinc-900 font-medium text-white'
                        : 'border border-zinc-200 bg-white text-zinc-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {activeMeta && <p className="px-4 pt-2 text-[11px] text-zinc-400">{activeMeta.sub}</p>}

            {/* 套餐卡片：单列纵向 */}
            <div className="mt-2.5 flex flex-col gap-2 px-4">
              {visible.map((plan, i) => (
                <PlanCardMobile key={plan.id} plan={plan} featured={visible.length >= 3 && i === 1} />
              ))}
            </div>
            {visible.length === 0 && (
              <p className="mx-3.5 mt-2.5 rounded-[12px] border border-dashed border-zinc-200 px-4 py-8 text-center text-xs text-zinc-400">
                该分类暂无套餐
              </p>
            )}

            <p className="mt-6 border-t border-zinc-100 px-4 pt-5 text-center text-xs text-zinc-500">
              额度怎么算？{' '}
              <Link to="/faq#billing" className="font-medium text-blue-600">
                计费规则与换算示例见常见问题 →
              </Link>
            </p>
          </>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-14">
      {plans === null ? (
        <p className="rounded-2xl border border-dashed border-zinc-200 px-6 py-10 text-center text-sm text-zinc-400">加载中…</p>
      ) : typeTabs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-200 px-6 py-10 text-center text-sm text-zinc-400">暂无在售套餐</p>
      ) : (
        <>
          {/* 筛选栏：左＝计费方式，右＝分类 */}
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-zinc-100 pb-6">
            <div className="inline-flex rounded-xl bg-zinc-100 p-1">
              {typeTabs.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => setType(t.type)}
                  className={`cursor-pointer rounded-lg px-5 py-2 text-sm font-medium transition ${
                    type === t.type
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {categories.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {categories.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategoryByType((prev) => ({ ...prev, [type]: key }))}
                    className={`cursor-pointer rounded-full px-4 py-1.5 text-xs transition ${
                      activeCategory === key
                        ? 'bg-zinc-900 font-medium text-white'
                        : 'border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeMeta && <p className="mt-5 text-sm text-zinc-500">{activeMeta.sub}</p>}

          {/* 套餐卡片网格 */}
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
          {visible.length === 0 && (
            <p className="mt-8 rounded-2xl border border-dashed border-zinc-200 px-6 py-10 text-center text-sm text-zinc-400">
              该分类暂无套餐
            </p>
          )}
        </>
      )}

      <p className="mt-16 border-t border-zinc-100 pt-8 text-center text-sm text-zinc-500">
        额度怎么算？{' '}
        <Link to="/faq#billing" className="font-medium text-blue-600 hover:text-blue-700">
          计费规则与换算示例见常见问题 →
        </Link>
      </p>
    </main>
  );
}
