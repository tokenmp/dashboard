import { Check, BarChart3, KeyRound, Percent, Shield, Shuffle, Ticket } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { CtaBand, CtaBandMobile } from './components';

/**
 * 功能特性页：六组能力，左右交替、顶线对齐（首组为纯文字版式）。
 */

const FEATURES = [
  {
    icon: KeyRound,
    title: '统一 API 密钥',
    desc: '一个密钥调用全部接入模型，接口完全兼容 OpenAI 规范，现有代码零改动迁移。',
    points: [
      'OpenAI 兼容的 chat / embeddings 接口',
      '密钥可随时吊销、按需限定可用模型范围',
      '官方 SDK / LangChain / Dify 等生态直接可用',
    ],
  },
  {
    icon: Percent,
    title: '透明倍率计费',
    desc: '每个模型独立倍率，按「倍率 × 次数」扣减额度，小数倍率精确落账。',
    points: [
      '模型广场公示全部倍率，无隐藏加价',
      '倍率精确到 0.1（如 flash 模型 ×0.1）',
      '每笔请求的扣费明细可逐条追溯',
    ],
    demo: <BillingDemo />,
  },
  {
    icon: Shield,
    title: '套餐限额',
    desc: '套餐额度与滚动 5 小时限额双重控制，防止个别程序失控刷爆预算。',
    points: [
      '套餐额度随周期自动重置（日卡每日、月卡每月）',
      '滚动 5h 限额：任意连续 5 小时窗口上限',
      '超额自动熔断，返回明确错误码',
    ],
    demo: <QuotaDemo />,
  },
  {
    icon: BarChart3,
    title: '用量明细',
    desc: '按模型、密钥、时间维度查看请求量、Token 消耗与扣费，成本趋势一目了然。',
    points: [
      '请求级明细：模型、耗时、Token、扣费',
      '多维汇总报表与趋势图',
      '支持按密钥维度拆分统计',
    ],
    demo: <TrendDemo />,
  },
  {
    icon: Ticket,
    title: '兑换码 & 模型市场',
    desc: '额度也是一种资产：兑换码即时充值，市场挂单把富余额度转让给需要的人。',
    points: [
      '兑换码一码一用、面额灵活',
      '市场挂单出售 / 购买额度，平台担保结算',
      '成交流水与结算单完整可查',
    ],
    demo: <RedeemDemo />,
  },
  {
    icon: Shuffle,
    title: '多上游智能路由',
    desc: '多家供应商接入，模型名自动映射，最优线路自动选择，故障自动切换。',
    points: [
      '上游供应商与密钥集中管理',
      '同一模型多上游，自动故障切换',
      '请求级链路追踪，问题定位不抓瞎',
    ],
    demo: <RouteDemo />,
  },
];

export default function Features() {
  const isMobile = useIsMobile();

  // 移动端专属分支：桌面交替双栏版式完全不渲染（视觉零变化）
  if (isMobile) return <FeaturesMobile />;

  return (
    <main>
      <section className="mx-auto max-w-6xl divide-y divide-zinc-100 px-6">
        {FEATURES.map((f, i) =>
          f.demo ? (
            <div key={f.title} className="grid items-start gap-12 py-20 md:grid-cols-2">
              <div className={i % 2 === 1 ? 'md:order-2' : ''}>
                <FeatureHead feature={f} />
              </div>
              <div className={i % 2 === 1 ? 'md:order-1' : ''}>{f.demo}</div>
            </div>
          ) : (
            // 首组（统一密钥）：纯文字版式，要点三列横排
            <div key={f.title} className="py-20">
              <FeatureHead feature={f} />
              <div className="mt-8 grid gap-6 sm:grid-cols-3">
                {f.points.map((p) => (
                  <div key={p} className="flex items-start gap-2.5 text-sm text-zinc-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          ),
        )}
      </section>
      <CtaBand title="想立即体验这些能力？" sub="注册即可获得体验额度。" />
    </main>
  );
}

/**
 * 移动端功能页（v3 ⑮ 定稿）：桌面交替双栏改为单列特性卡列表
 * （32px 圆角图标底 + 标题 + 11px 描述），要点与示意图不随卡片展示，详情进桌面版。
 */
function FeaturesMobile() {
  return (
    <main className="pb-1">
      <h1 className="px-4 pt-4 text-[19px] font-extrabold tracking-tight text-zinc-900">功能特性</h1>
      <div className="mt-2.5 flex flex-col gap-[7px] px-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-[12px] border border-zinc-100 bg-gradient-to-b from-zinc-50 to-white p-3"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-blue-600/10 text-blue-600">
                <f.icon className="h-4 w-4" />
              </span>
              <h2 className="text-[13px] font-bold text-zinc-900">{f.title}</h2>
            </div>
            <p className="mt-2 text-[11px] leading-[1.55] text-zinc-500">{f.desc}</p>
          </div>
        ))}
      </div>
      <CtaBandMobile title="想立即体验这些能力？" sub="注册即可获得体验额度。" />
    </main>
  );
}

interface FeatureDef {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  points: string[];
}

function FeatureHead({ feature }: { feature: FeatureDef }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-blue-600">
          <feature.icon className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">{feature.title}</h2>
      </div>
      <p className="mt-3 leading-relaxed text-zinc-500">{feature.desc}</p>
      <ul className="mt-6 space-y-3 text-sm text-zinc-600">
        {feature.points.map((p) => (
          <li key={p} className="flex items-start gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 白卡容器：各示意图统一风格 */
function DemoCard({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
      {label && <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>}
      {children}
    </div>
  );
}

function BillingDemo() {
  return (
    <DemoCard label="一次会话的扣费示例">
      <div className="mt-5 space-y-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-zinc-600">
            调用 glm-4.7 <span className="ml-1.5 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-500">×1.0</span>
          </span>
          <span className="font-mono font-medium text-zinc-900">−1.0</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-600">
            调用 glm-4.7-flash{' '}
            <span className="ml-1.5 rounded-md bg-emerald-50 px-1.5 py-0.5 font-mono text-xs text-emerald-700">×0.1</span>
          </span>
          <span className="font-mono font-medium text-zinc-900">−0.1</span>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
          <span className="font-medium text-zinc-900">合计扣减</span>
          <span className="font-mono font-semibold text-blue-600">−1.1 次</span>
        </div>
      </div>
    </DemoCard>
  );
}

function QuotaDemo() {
  return (
    <DemoCard>
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">当前套餐 · 标准版</div>
        <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">正常</span>
      </div>
      <div className="mt-6 space-y-6">
        <div>
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-zinc-600">每月额度</span>
            <span className="font-mono text-xs text-zinc-500">32,600 / 50,000</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: '65%' }} />
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-zinc-600">滚动 5h 限额</span>
            <span className="font-mono text-xs text-zinc-500">410 / 2,000</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-zinc-900" style={{ width: '20%' }} />
          </div>
        </div>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-zinc-400">两者任一触达即暂停调用，额度恢复后自动继续。</p>
    </DemoCard>
  );
}

function TrendDemo() {
  // 高度与颜色分开映射，避免动态拼接 Tailwind 类名（JIT 扫描不到）
  const bars: Array<{ h: number; cls: string }> = [
    { h: 35, cls: 'bg-zinc-100' },
    { h: 55, cls: 'bg-zinc-200' },
    { h: 45, cls: 'bg-zinc-100' },
    { h: 70, cls: 'bg-zinc-200' },
    { h: 90, cls: 'bg-zinc-300' },
    { h: 60, cls: 'bg-zinc-200' },
    { h: 100, cls: 'bg-blue-600' },
  ];
  return (
    <DemoCard>
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">近 7 日调用量</div>
        <div className="font-mono text-xs text-zinc-400">↑ 23%</div>
      </div>
      <div className="mt-6 flex h-28 items-end gap-2.5">
        {bars.map((b, i) => (
          <div key={i} className={`flex-1 rounded-md ${b.cls}`} style={{ height: `${b.h}%` }} />
        ))}
      </div>
      <div className="mt-3 flex justify-between font-mono text-[10px] text-zinc-400">
        <span>周一</span>
        <span>周日</span>
      </div>
    </DemoCard>
  );
}

function RedeemDemo() {
  return (
    <DemoCard>
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-5 text-center">
        <div className="text-xs text-zinc-400">兑换码</div>
        <div className="mt-1.5 font-mono text-lg font-semibold tracking-[0.2em] text-zinc-900">TMP-XXXX-XXXX-XXXX</div>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-5 text-sm">
        <span className="text-zinc-500">兑换面额</span>
        <span className="font-mono font-medium text-emerald-600">+5,000 次</span>
      </div>
    </DemoCard>
  );
}

function RouteDemo() {
  const rows = [
    { dot: 'bg-emerald-500', name: '供应商 A', nameCls: 'font-medium text-zinc-900', meta: '120ms · 主线路', wrap: 'border-zinc-200 bg-zinc-50/60', ml: '' },
    { dot: 'bg-amber-400', name: '供应商 B', nameCls: 'text-zinc-700', meta: '260ms · 备用', wrap: 'border-zinc-200', ml: 'ml-6' },
    { dot: 'bg-zinc-300', name: '供应商 C', nameCls: 'text-zinc-500', meta: '已停用', wrap: 'border-zinc-200 opacity-60', ml: 'ml-12' },
  ];
  return (
    <DemoCard>
      <div className="m-2 space-y-2.5 text-sm">
        {rows.map((r) => (
          <div key={r.name} className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 ${r.wrap} ${r.ml}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${r.dot}`} />
            <span className={r.nameCls}>{r.name}</span>
            <span className="ml-auto font-mono text-xs text-zinc-400">{r.meta}</span>
          </div>
        ))}
      </div>
    </DemoCard>
  );
}
