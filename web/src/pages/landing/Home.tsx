import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, CalendarDays, Check, Clock, Coins, Hash, KeyRound, Percent, Shield, Shuffle, Ticket, Timer, type LucideIcon } from 'lucide-react';
import ModelIcon from '@/components/ModelIcon';
import { getSiteModelsApi, getSiteOverviewApi, getSitePlansApi } from '@/api/site';
import { useIsMobile } from '@/hooks/use-is-mobile';
import type { SiteModel, SiteOverview, SitePlan } from '@/types/site';
import {
  CodeWindow,
  CtaBand,
  CtaBandMobile,
  Eyebrow,
  HeroActions,
  MultiplierBadge,
  SITE_CONTACT_EMAIL,
  capabilityText,
} from './components';
import { formatCount, formatMultiplier, formatTokens } from './components';

/**
 * Landing 首页：对所有人可见（含已登录用户，已登录者通过导航栏「进入控制台」去后台）。
 * 登录后的按角色跳转由登录页与「进入控制台」按钮各自处理。
 */

const FEATURES = [
  {
    icon: KeyRound,
    title: '统一 API 密钥',
    desc: '一个密钥调用全部模型，OpenAI 兼容格式，现有代码零改动迁移。',
  },
  {
    icon: Percent,
    title: '透明倍率计费',
    desc: '每模型独立倍率、小数精确扣费，每一笔消耗都可追溯。',
  },
  {
    icon: Shield,
    title: '套餐限额',
    desc: '每日/每月额度 + 滚动 5 小时限额双重控制，超额自动熔断。',
  },
  {
    icon: BarChart3,
    title: '用量明细',
    desc: '按模型、密钥、时间维度的请求与消耗报表，趋势一目了然。',
  },
  {
    icon: Ticket,
    title: '兑换码 & 模型市场',
    desc: '兑换码充值额度，市场挂单转让富余额度，额度流动起来。',
  },
  {
    icon: Shuffle,
    title: '多上游智能路由',
    desc: '多供应商接入与模型映射，最优线路自动选择、故障切换。',
  },
];

function LandingHome() {
  const isMobile = useIsMobile();
  const [overview, setOverview] = useState<SiteOverview | null>(null);
  const [models, setModels] = useState<SiteModel[]>([]);
  const [plans, setPlans] = useState<SitePlan[]>([]);

  useEffect(() => {
    getSiteOverviewApi().then(setOverview).catch(() => setOverview(null));
    getSiteModelsApi()
      .then((list) => setModels(list.slice(0, 4)))
      .catch(() => setModels([]));
    getSitePlansApi()
      .then((list) => {
        // 预览只展示在售（价格 > 0）套餐，避免占位/赠礼套餐登上首页
        const paid = list.filter((p) => p.price > 0);
        setPlans((paid.length ? paid : list).slice(0, 3));
      })
      .catch(() => setPlans([]));
  }, []);

  const stats: Array<[string, string]> = [
    [overview ? `${overview.models}+` : '—', '接入模型'],
    [overview ? `${overview.providers}+` : '—', '上游供应商'],
    [overview?.min_multiplier != null ? `×${formatMultiplier(overview.min_multiplier)}` : '—', '最低模型倍率'],
    ['100%', 'OpenAI 兼容'],
  ];

  // 移动端专属分支：桌面 JSX 完全不渲染（视觉零变化）
  if (isMobile) {
    return <LandingHomeMobile overview={overview} models={models} plans={plans} />;
  }

  return (
    <main>
      {/* ── Hero：左右布局，标题顶线与代码卡对齐 ── */}
      <section className="relative overflow-hidden border-b border-zinc-100">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_55%_at_70%_-10%,rgba(37,99,235,0.08),transparent)]" />
        <div className="mx-auto grid max-w-6xl items-start gap-14 px-6 py-16 md:grid-cols-2 md:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              OpenAI 兼容接口 · 一行代码迁移
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-zinc-900 md:text-5xl">
              一个入口，
              <br />
              用遍<span className="text-blue-600">所有大模型</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-zinc-500">
              一个 API 密钥调用全部主流模型。透明倍率、套餐限额、用量明细——成本尽在掌握。
            </p>
            <HeroActions />
            <p className="mt-8 text-xs text-zinc-400">
              兼容 OpenAI SDK · LangChain · Dify · NextChat · Claude Code&nbsp;&nbsp;|&nbsp;&nbsp;商务与技术支持：
              <a
                href={`mailto:${SITE_CONTACT_EMAIL}`}
                className="text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900"
              >
                {SITE_CONTACT_EMAIL}
              </a>
            </p>
          </div>
          <CodeWindow />
        </div>
      </section>

      {/* ── 数据条 ── */}
      <section className="border-b border-zinc-100">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-10 px-6 py-14 text-center md:grid-cols-4">
          {stats.map(([value, label], i) => (
            <div key={label} className={i < stats.length - 1 ? 'md:border-r md:border-zinc-100' : ''}>
              <div className="text-3xl font-semibold tracking-tight text-zinc-900">{value}</div>
              <div className="mt-1.5 text-sm text-zinc-500">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 功能特性 ── */}
      <section className="bg-zinc-50/60">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-2xl">
            <Eyebrow>功能特性</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl">为「用得起、看得清」而设计</h2>
            <p className="mt-4 text-zinc-500">从个人开发者到团队，开箱即用的用量与成本管理。</p>
          </div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Link
                key={f.title}
                to="/features"
                className="rounded-2xl border border-zinc-200 bg-white p-7 transition hover:border-zinc-300 hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-blue-600">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-zinc-900">{f.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-zinc-500">{f.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 模型广场预览 ── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <Eyebrow>模型广场</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl">全部模型，公开倍率</h2>
            <p className="mt-4 text-zinc-500">一个密钥全部通用，倍率对每个模型公开，无隐藏加价。</p>
          </div>
          <Link to="/models" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            查看全部模型 →
          </Link>
        </div>
        {models.length > 0 ? (
          <ModelsPreviewTable models={models} />
        ) : (
          <p className="mt-10 rounded-2xl border border-dashed border-zinc-200 px-6 py-10 text-center text-sm text-zinc-400">
            模型目录加载中或暂无可用模型
          </p>
        )}
      </section>

      {/* ── 套餐预览 ── */}
      {plans.length > 0 && (
        <section className="border-t border-zinc-100 bg-zinc-50/60">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow>套餐</Eyebrow>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl">简单透明的定价</h2>
              <p className="mt-4 text-zinc-500">套餐额度随周期自动重置，随时可用兑换码补充。</p>
            </div>
            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {plans.map((plan, i) => (
                <PlanCard key={plan.id} plan={plan} featured={plans.length >= 3 && i === 1} />
              ))}
            </div>
            <p className="mt-8 text-center">
              <Link to="/plans" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                查看全部套餐 →
              </Link>
            </p>
          </div>
        </section>
      )}

      <CtaBand title="准备好开始了吗？" sub="注册即送体验额度，一行代码完成迁移。" />
    </main>
  );
}

/**
 * 移动端首页（v3 ⑭ 定稿）：单列 hero（23px 标题 + 纵向全宽 CTA）+ 一行三列统计卡
 * + 横滑特性卡（~210px 宽，隐藏滚动条）+ 单列模型预览 / 套餐预览 + 页尾渐变 CTA 卡。
 */
function LandingHomeMobile({
  overview,
  models,
  plans,
}: {
  overview: SiteOverview | null;
  models: SiteModel[];
  plans: SitePlan[];
}) {
  // 统计改一行三列：取前三项（OpenAI 兼容已由 hero 徽章表达，避免四列过挤）
  const stats: Array<[string, string]> = [
    [overview ? `${overview.models}+` : '—', '接入模型'],
    [overview ? `${overview.providers}+` : '—', '上游供应商'],
    [overview?.min_multiplier != null ? `×${formatMultiplier(overview.min_multiplier)}` : '—', '最低模型倍率'],
  ];

  return (
    <main className="pb-1">
      {/* ── Hero：单列，pill 徽章 + 23px 两行标题 + 纵向全宽 CTA ── */}
      <section className="px-4 pt-5">
        <span className="inline-flex items-center gap-[5px] rounded-full bg-blue-600/[0.07] px-[9px] py-1 text-[10.5px] font-semibold text-blue-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          OpenAI 兼容接口 · 一行代码迁移
        </span>
        <h1 className="mt-[11px] text-[23px] font-extrabold leading-[1.25] tracking-tight text-zinc-900">
          一个入口，
          <br />
          用遍<span className="text-blue-600">所有大模型</span>
        </h1>
        <p className="mt-2 text-[12.5px] leading-[1.6] text-zinc-500">
          一个 API 密钥调用全部主流模型。透明倍率、套餐限额、用量明细——成本尽在掌握。
        </p>
        <div className="mt-[15px] flex flex-col gap-2">
          <a
            href="/register"
            className="flex h-[42px] items-center justify-center rounded-[10px] bg-zinc-900 text-[13.5px] font-semibold text-white transition hover:bg-zinc-700"
          >
            免费注册
          </a>
          <Link
            to="/models"
            className="flex h-[42px] items-center justify-center rounded-[10px] border border-zinc-200 bg-white text-[13.5px] font-semibold text-zinc-900 transition hover:bg-zinc-50"
          >
            查看模型价格
          </Link>
          <p className="text-center text-[10.5px] text-zinc-400">注册即送体验额度，一行代码完成迁移</p>
        </div>
      </section>

      {/* ── 统计：一行三列紧凑卡 ── */}
      <section className="mt-[15px] px-4">
        <div className="grid grid-cols-3 rounded-[12px] border border-zinc-100 bg-white py-2.5">
          {stats.map(([value, label]) => (
            <div key={label} className="text-center">
              <div className="text-[15px] font-extrabold tracking-tight text-zinc-900">{value}</div>
              <div className="mt-px text-[10px] text-zinc-400">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 功能特性：横滑卡片（~210px 宽，隐藏滚动条） ── */}
      <section>
        <h2 className="px-4 pb-0.5 pt-[15px] text-[14.5px] font-extrabold tracking-tight text-zinc-900">
          为「用得起、看得清」而设计
        </h2>
        <p className="px-4 text-[11px] text-zinc-400">左滑查看更多 →</p>
        <div className="mt-[9px] flex gap-[9px] overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FEATURES.map((f) => (
            <Link
              key={f.title}
              to="/features"
              className="w-[210px] shrink-0 rounded-[12px] border border-zinc-100 bg-gradient-to-b from-zinc-50 to-white p-3"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-blue-600/10 text-blue-600">
                <f.icon className="h-4 w-4" />
              </span>
              <h3 className="mt-[9px] text-[13px] font-bold text-zinc-900">{f.title}</h3>
              <p className="mt-1 text-[11px] leading-[1.55] text-zinc-500">{f.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── 模型广场预览：单列列表卡 ── */}
      <section className="mt-3 px-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[14.5px] font-extrabold tracking-tight text-zinc-900">全部模型，公开倍率</h2>
          <Link to="/models" className="shrink-0 text-[11px] font-medium text-blue-600">
            查看全部 →
          </Link>
        </div>
        {models.length > 0 ? (
          <div className="mt-2 flex flex-col gap-[7px]">
            {models.map((m) => (
              <Link
                key={m.id}
                to="/models"
                className="flex items-center gap-2.5 rounded-[10px] border border-zinc-100 bg-white px-[11px] py-[9px]"
              >
                <ModelIcon id={m.name} displayName={m.display_name ?? undefined} size={20} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12.5px] font-semibold text-zinc-700">{m.name}</span>
                  <span className="mt-px block truncate text-[10.5px] text-zinc-400">
                    {formatTokens(m.context_window)} · {capabilityText(m.capabilities)}
                  </span>
                </span>
                <MultiplierBadge multiplier={m.multiplier} billingMode={m.billing_mode} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-2 rounded-[12px] border border-dashed border-zinc-200 px-4 py-8 text-center text-xs text-zinc-400">
            模型目录加载中或暂无可用模型
          </p>
        )}
      </section>

      {/* ── 套餐预览：单列纵向 ── */}
      {plans.length > 0 && (
        <section className="mt-4 px-4">
          <h2 className="text-[14.5px] font-extrabold tracking-tight text-zinc-900">简单透明的定价</h2>
          <div className="mt-2 flex flex-col gap-2">
            {plans.map((plan, i) => (
              <PlanCardMobile key={plan.id} plan={plan} featured={plans.length >= 3 && i === 1} />
            ))}
          </div>
          <p className="mt-3 text-center">
            <Link to="/plans" className="text-[11.5px] font-medium text-blue-600">
              查看全部套餐 →
            </Link>
          </p>
        </section>
      )}

      <CtaBandMobile title="准备好开始了吗？" sub="注册即送体验额度，一行代码完成迁移。" />
    </main>
  );
}

function ModelsPreviewTable({ models }: { models: SiteModel[] }) {
  return (
    <div className="mt-10 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 bg-zinc-50/60 text-left text-xs uppercase tracking-wide text-zinc-400">
            <th className="px-6 py-4 font-medium">模型</th>
            <th className="px-6 py-4 font-medium">供应商</th>
            <th className="px-6 py-4 font-medium">倍率</th>
            <th className="hidden px-6 py-4 font-medium md:table-cell">支持能力</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {models.map((m) => (
            <tr key={m.id} className="transition hover:bg-zinc-50/60">
              <td className="px-6 py-4">
                <span className="flex items-center gap-2.5">
                  <ModelIcon id={m.name} displayName={m.display_name ?? undefined} size={24} />
                  <span className="font-mono text-[13px] font-medium text-zinc-900">{m.name}</span>
                </span>
              </td>
              <td className="px-6 py-4 text-zinc-500">{m.owned_by}</td>
              <td className="px-6 py-4">
                <MultiplierBadge multiplier={m.multiplier} billingMode={m.billing_mode} />
              </td>
              <td className="hidden px-6 py-4 text-zinc-500 md:table-cell">{capabilityText(m.capabilities)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 套餐卡片（首页预览与套餐页共用） */
export function PlanCard({ plan, featured }: { plan: SitePlan; featured?: boolean }) {
  const items = planLimitItems(plan);
  return (
    <div
      className={`flex flex-col rounded-2xl p-8 ${
        featured ? 'bg-zinc-900 text-white shadow-xl' : 'border border-zinc-200 bg-white'
      }`}
    >
      <h3 className={`font-semibold ${featured ? 'text-white' : 'text-zinc-900'}`}>{plan.name}</h3>
      <p className={`mt-1 text-sm ${featured ? 'text-zinc-400' : 'text-zinc-500'}`}>{planTypeLabel(plan.plan_type)}</p>
      <div className={`mt-6 text-4xl font-semibold tracking-tight ${featured ? 'text-white' : 'text-zinc-900'}`}>
        {plan.price > 0 ? `¥${plan.price}` : '免费'}
        {plan.price > 0 && priceSuffix(plan.category) && (
          <span className={`text-base font-normal ${featured ? 'text-zinc-500' : 'text-zinc-400'}`}>{priceSuffix(plan.category)}</span>
        )}
      </div>
      <ul className={`mt-8 flex-1 space-y-3 text-sm ${featured ? 'text-zinc-300' : 'text-zinc-600'}`}>
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2.5">
            <item.icon className={`mt-0.5 h-4 w-4 shrink-0 ${featured ? 'text-blue-400' : 'text-blue-600'}`} />
            <span>
              {item.label} {item.value}
            </span>
          </li>
        ))}
      </ul>
      <a
        href="/register"
        className={`mt-8 rounded-lg py-2.5 text-center text-sm font-medium transition ${
          featured
            ? 'bg-white text-zinc-900 hover:bg-zinc-200'
            : 'border border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
        }`}
      >
        {plan.price > 0 ? '立即订阅' : '免费注册'}
      </a>
    </div>
  );
}

/** 移动端套餐卡片（v3 ⑰ 定稿）：单列紧凑版，首页预览与套餐页共用；推荐套餐蓝描边 + 角标 + 全宽 CTA */
export function PlanCardMobile({ plan, featured }: { plan: SitePlan; featured?: boolean }) {
  const items = planLimitItems(plan);
  return (
    <div
      className={`relative rounded-[12px] bg-white p-3 ${
        featured ? 'border-[1.5px] border-blue-600' : 'border border-zinc-100'
      }`}
    >
      {featured && (
        <span className="absolute -top-px right-2.5 rounded-b-md bg-blue-600 px-[7px] py-0.5 text-[9.5px] font-semibold text-white">
          最受欢迎
        </span>
      )}
      <div className="flex items-baseline justify-between gap-2 pt-0.5">
        <h3 className="text-[13.5px] font-bold text-zinc-900">{plan.name}</h3>
        <div className="text-[15px] font-extrabold tracking-tight text-zinc-900">
          {plan.price > 0 ? `¥${plan.price}` : '免费'}
          {plan.price > 0 && priceSuffix(plan.category) && (
            <span className="text-[10.5px] font-normal text-zinc-400">{priceSuffix(plan.category)}</span>
          )}
        </div>
      </div>
      <p className="mt-0.5 text-[10.5px] text-zinc-400">{planTypeLabel(plan.plan_type)}</p>
      <ul className="mt-2 space-y-[3px]">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5 text-[11.5px] leading-[1.6] text-zinc-600">
            <item.icon className="h-3 w-3 shrink-0 text-blue-600" />
            <span>
              {item.label} {item.value}
            </span>
          </li>
        ))}
      </ul>
      <a
        href="/register"
        className={`mt-[11px] flex h-[38px] items-center justify-center rounded-[10px] text-[13px] font-semibold transition ${
          featured ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-zinc-900 text-white hover:bg-zinc-700'
        }`}
      >
        {plan.price > 0 ? '立即订阅' : '免费注册'}
      </a>
    </div>
  );
}

/** 套餐限额条目：只展示非空字段，[标签, 值] */
/** 限额条目：按语义配图标（次数/周期/时长/Token 各不相同） */
export interface PlanLimitItem {
  label: string;
  value: string;
  icon: LucideIcon;
}

/**
 * 把「周期额度」翻译成用户能理解的口径：
 * 日卡=每日额度、周卡=每周额度、月卡=每月额度、永久/按量=总额度。
 * （cycle_limit 本义是「每个计费周期的额度」，直接展示「周期额度」会让用户困惑。）
 */
export function cycleLimitLabel(category: string | null): string {
  switch (category) {
    case 'daily':
    case 'day':
      return '每日额度';
    case 'week':
      return '每周额度';
    case 'month':
      return '每月额度';
    case 'permanent':
      return '总额度';
    default:
      return '额度';
  }
}

/**
 * 价格单位后缀，按分类翻译：日卡 /天、周卡 /周、月卡 /月；
 * 永久 / 按量为一次性价格，不带后缀。
 */
export function priceSuffix(category: string | null): string {
  switch (category) {
    case 'daily':
    case 'day':
      return '/天';
    case 'week':
      return '/周';
    case 'month':
      return '/月';
    default:
      return '';
  }
}

export function planLimitItems(plan: SitePlan): PlanLimitItem[] {
  const items: PlanLimitItem[] = [];
  const cycle = plan.total_limit && plan.total_limit > 0 ? plan.total_limit : plan.cycle_limit;
  if (cycle && cycle > 0) {
    items.push({ label: cycleLimitLabel(plan.category), value: `${formatCount(cycle)} 次`, icon: Hash });
  }
  // 周卡场景下周期额度即每周额度，避免与周限额重复展示
  const weekCategory = plan.category === 'week';
  if (plan.weekly_limit && !weekCategory) {
    items.push({ label: '每周限额', value: `${formatCount(plan.weekly_limit)} 次`, icon: CalendarDays });
  }
  if (plan.rolling_5h_limit) items.push({ label: '滚动 5h 限额', value: `${formatCount(plan.rolling_5h_limit)} 次`, icon: Timer });
  if (plan.token_limit) items.push({ label: 'Token 额度', value: formatCount(plan.token_limit), icon: Coins });
  if (plan.default_duration_days) items.push({ label: '有效期', value: `${plan.default_duration_days} 天`, icon: Clock });
  if (!items.length) items.push({ label: '额度说明', value: '详见控制台', icon: Check });
  return items;
}

export function planTypeLabel(t: string): string {
  return t === 'coding' ? '按次计费' : t === 'token' ? 'Token 计费' : t === 'image' ? '图像生成' : t;
}

export default LandingHome;
