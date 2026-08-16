import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, ScrollText, Gauge, Gift } from 'lucide-react';
import { getPanelOverviewApi, getPanelOverviewModelsApi } from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { cn } from '@/lib/utils';
import { formatCompact, formatNumber, formatPercent } from '@/utils/format';
import type { UserKpi, TrendPoint } from '@/types/dashboard';

/** 快捷操作四宫格（密钥 / 日志 / 账单 / 兑换码） */
const QUICK_ACTIONS = [
  { to: '/panel/keys', label: '复制密钥', icon: KeyRound },
  { to: '/panel/requests', label: '请求日志', icon: ScrollText },
  { to: '/panel/usage', label: '计费账单', icon: Gauge },
  { to: '/panel/redemptions', label: '兑换码', icon: Gift },
];

/**
 * 用户面·概览（移动专属，v3 定稿）：不照搬桌面「4 KPI 卡 + 双大图表」，
 * 改为「深色 hero 焦点卡 + 快捷操作四宫格 + 纯 CSS 7 日柱状趋势 + 模型用量 TOP3」。
 * - 模型榜固定 period='7d'：hero 已聚焦今日（今日 Token / 请求 / 成功率），
 *   7 天窗口与上方趋势区块口径一致且更稳定，省去桌面 today/7d/month Select 切换；
 *   「全部 →」改为卡内展开（接口一次返回前 10 条），避免跳模型目录造成语义错位。
 * - 榜单按 token 用量排序（贴合「模型用量」标题），接口本身按 requests 降序，前端重排。
 */
export function OverviewMobile() {
  // hero 与 7 日趋势共用一份概览数据（含 kpi + trend）
  const { data, error } = useAsync(getPanelOverviewApi);

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-xl border border-destructive/40 bg-card p-3 text-[12px] text-destructive">
          {error}
        </div>
      )}

      {/* 接口快，不用骨架屏：加载中不渲染数据区块，数据到了直接出现 */}
      {data && <HeroCard kpi={data.kpi} trend={data.trend} />}

      {/* 快捷操作为静态入口，不依赖接口，加载中 / 出错时也可用 */}
      <QuickActions />

      {data && <TrendSection trend={data.trend} />}

      <TopModelsSection />
    </div>
  );
}

/* ----------------------------- 焦点卡（hero） ----------------------------- */

/**
 * 焦点卡：主数字 = 今日 Token 消耗；分隔线下三档次指标 = 今日请求 / 成功率 / 累计 Token。
 * 环比 chip 由趋势数据的今日 vs 昨日 token 真实计算（trend 恒含当天），
 * 昨日无用量或数据不足时直接省略，不编造。
 */
function HeroCard({ kpi, trend }: { kpi: UserKpi; trend: TrendPoint[] }) {
  const todayPt = trend.length >= 1 ? trend[trend.length - 1] : null;
  const yesterdayPt = trend.length >= 2 ? trend[trend.length - 2] : null;
  let chip: { up: boolean; text: string } | null = null;
  if (todayPt && yesterdayPt && yesterdayPt.tokens > 0) {
    const pct = ((todayPt.tokens - yesterdayPt.tokens) / yesterdayPt.tokens) * 100;
    chip = { up: pct >= 0, text: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% 较昨日` };
  }

  return (
    <div className="rounded-[13px] bg-gradient-to-br from-zinc-900 to-blue-900 p-3.5 text-white">
      <div className="text-[11px] text-white/65">今日 Token 消耗</div>
      <div className="mt-0.5 text-[25px] font-extrabold leading-tight tracking-tight tabular-nums">
        {formatCompact(kpi.todayTokens)}
      </div>
      <div className="mt-2.5 flex gap-3.5 border-t border-white/15 pt-2.5">
        <HeroCell label="今日请求" value={formatNumber(kpi.todayRequests)} />
        <HeroCell label="成功率" value={formatPercent(kpi.todaySuccessRate)} />
        <HeroCell label="累计 Token" value={formatCompact(kpi.totalTokens)} />
      </div>
      {chip && (
        <span
          className={cn(
            'mt-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px]',
            chip.up ? 'text-green-300' : 'text-red-300',
          )}
        >
          {chip.text}
        </span>
      )}
    </div>
  );
}

/** hero 次指标单元格：10px 弱化标签 + 13.5px 加粗数值 */
function HeroCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-white/60">{label}</div>
      <div className="mt-px text-[13.5px] font-bold tabular-nums">{value}</div>
    </div>
  );
}

/* ----------------------------- 快捷操作 ----------------------------- */

/** 四宫格快捷入口：38px 灰底圆角图标 + 10.5px 文案 */
function QuickActions() {
  return (
    <div className="grid grid-cols-4 gap-1 py-1">
      {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="flex flex-col items-center gap-1.5 rounded-lg py-1 active:bg-accent/50"
        >
          <span className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-muted text-zinc-800">
            <Icon className="h-[17px] w-[17px]" />
          </span>
          <span className="text-[10.5px] text-zinc-700">{label}</span>
        </Link>
      ))}
    </div>
  );
}

/* ----------------------------- 7 日趋势 ----------------------------- */

/**
 * 7 日请求趋势：纯 CSS 迷你柱状图（高度按 requests 归一化，今天高亮蓝），
 * 不引入 recharts；近 7 天全为 0 时整块隐藏。
 */
function TrendSection({ trend }: { trend: TrendPoint[] }) {
  const week = trend.slice(-7);
  if (!week.some((p) => p.requests > 0)) return null;
  const max = Math.max(1, ...week.map((p) => p.requests));
  const mid = week[Math.floor((week.length - 1) / 2)];

  return (
    <>
      <SectionHeader
        title="7 日请求趋势"
        extra={
          <Link to="/panel/requests" className="text-[11px] font-medium text-blue-600">
            查看日志 →
          </Link>
        }
      />
      <div className="rounded-xl border bg-card p-3">
        <div className="flex h-14 items-end gap-1.5">
          {week.map((p, i) => (
            <div
              key={p.day}
              className={cn(
                'min-h-[3px] flex-1 rounded-t-[3px]',
                i === week.length - 1 ? 'bg-blue-600' : 'bg-blue-200',
              )}
              style={{ height: `${Math.max((p.requests / max) * 100, 4)}%` }}
              title={`${p.day} · ${formatNumber(p.requests)} 次请求`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[9px] tabular-nums text-muted-foreground">
          <span>{week[0].day.slice(5)}</span>
          {mid !== week[0] && mid !== week[week.length - 1] && <span>{mid.day.slice(5)}</span>}
          <span>今天</span>
        </div>
      </div>
    </>
  );
}

/* ----------------------------- 模型用量 TOP3 ----------------------------- */

/**
 * 模型用量 TOP3：固定近 7 天、按 token 用量排序的排行条。
 * 「全部 →」在卡内展开至接口返回的全部条目（默认前 10），展开后变为「收起」。
 */
function TopModelsSection() {
  const { data, loading, error } = useAsync(() => getPanelOverviewModelsApi('7d'), []);
  const [expanded, setExpanded] = useState(false);

  // 接口按 requests 降序返回，此处按 token 用量重排以贴合「模型用量」口径
  const items = [...(data ?? [])].sort((a, b) => b.tokens - a.tokens);
  const shown = expanded ? items : items.slice(0, 3);
  const max = Math.max(1, ...items.map((m) => m.tokens));

  // 空数据整块隐藏（加载中 / 出错仍保留骨架与错误提示）
  if (!loading && !error && items.length === 0) return null;

  return (
    <>
      <SectionHeader
        title={
          <span>
            模型用量 TOP3
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">近 7 天</span>
          </span>
        }
        extra={
          items.length > 3 ? (
            <button
              type="button"
              className="text-[11px] font-medium text-blue-600"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? '收起' : '全部 →'}
            </button>
          ) : undefined
        }
      />
      <div className="rounded-xl border bg-card px-3 py-1">
        {error ? (
          <p className="py-2 text-[11px] text-destructive">{error}</p>
        ) : loading ? null : (
          <div className="divide-y divide-muted">
            {shown.map((m) => (
              <div
                key={m.model}
                className="flex items-center gap-2 py-2"
                title={`${m.model}：${formatNumber(m.tokens)} token · ${formatNumber(m.requests)} 次调用`}
              >
                <span className="w-[96px] shrink-0 truncate text-[12px] font-semibold">{m.model}</span>
                <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${Math.max((m.tokens / max) * 100, 3)}%` }}
                  />
                </div>
                <span className="w-[50px] shrink-0 text-right text-[10.5px] tabular-nums text-muted-foreground">
                  {formatCompact(m.tokens)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ----------------------------- 辅助 ----------------------------- */

/** 区块头：13px 加粗标题 + 右侧弱化链接 / 操作（与卡片间距收紧） */
function SectionHeader({ title, extra }: { title: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-1 pt-1.5">
      <h4 className="text-[13px] font-bold">{title}</h4>
      {extra}
    </div>
  );
}

