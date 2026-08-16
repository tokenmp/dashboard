import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getSiteModelsApi, getSitePlansApi } from '@/api/site';
import { useIsMobile } from '@/hooks/use-is-mobile';
import type { SiteModel, SitePlan } from '@/types/site';
import { CtaBand, CtaBandMobile, formatCount, formatMultiplier } from './components';
import { cycleLimitLabel } from './Home';

/**
 * 常见问题：按「接入 / 计费规则 / 安全」分组的折叠列表。
 * 「计费规则」组（#billing）承载额度计算规则与换算示例，
 * 供套餐页等处通过 /faq#billing 跳转过来。
 */

const GROUPS: Array<{ label: string; items: Array<{ q: string; a: React.ReactNode }> }> = [
  {
    label: '接入相关',
    items: [
      {
        q: '兼容哪些客户端和框架？',
        a: '所有使用 OpenAI 兼容接口的工具均可直接使用：OpenAI 官方 SDK、LangChain、Dify、NextChat、LobeChat、Claude Code 等，只需替换 base_url 与 api_key。',
      },
      {
        q: '从官方 API 迁移需要改多少代码？',
        a: (
          <>
            通常只需两行：把 api_key 换成 TokenMP 密钥，把 base_url 换成 TokenMP 地址。模型名按
            <Link to="/models" className="mx-1 font-medium text-blue-600 hover:text-blue-700">
              模型广场
            </Link>
            的名称调用即可。
          </>
        ),
      },
      {
        q: '支持流式输出（SSE）吗？',
        a: '支持。具备对应能力的模型均可使用 stream=true 的 SSE 流式响应，与 OpenAI 格式一致。',
      },
    ],
  },
  {
    label: '安全',
    items: [
      {
        q: '我的数据安全吗？',
        a: '请求内容仅用于向模型上游转发完成调用，不用于其他用途。密钥支持随时吊销、按需限定可用模型范围，账号操作有完整审计记录。',
      },
      {
        q: '密钥泄露了怎么办？',
        a: '立即在控制台吊销该密钥并创建新密钥。吊销即时生效，之后所有使用旧密钥的请求都会被拒绝。',
      },
    ],
  },
];

export default function Faq() {
  const isMobile = useIsMobile();

  // 移动端专属分支（v3 ⑱ 定稿）：手风琴独立卡片（问句 12.5px / 答案 11.5px），计费规则紧凑化，桌面排版不渲染
  if (isMobile) {
    return (
      <>
        <main className="pb-1">
          <h1 className="px-4 pt-4 text-[19px] font-extrabold tracking-tight text-zinc-900">常见问题</h1>
          {GROUPS.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? 'mt-5' : 'mt-3'}>
              <h2 className="px-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                {group.label}
              </h2>
              <div className="flex flex-col gap-[7px] px-4">
                {group.items.map((item, ii) => (
                  <details
                    key={item.q}
                    className="group overflow-hidden rounded-[11px] border border-zinc-100 bg-white"
                    open={gi === 0 && ii === 0}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-[11px] text-[12.5px] font-semibold text-zinc-700">
                      {item.q}
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition group-open:rotate-180" />
                    </summary>
                    <p className="border-t border-dashed border-zinc-100 px-3 pb-[11px] pt-[9px] text-[11.5px] leading-[1.65] text-zinc-500">
                      {item.a}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          ))}

          <div id="billing" className="mt-5 scroll-mt-20" />
          <h2 className="px-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">计费规则</h2>
          <BillingRules compact />

          <p className="mt-4 px-4 text-[11.5px] leading-relaxed text-zinc-500">
            查看在售套餐与价格见
            <Link to="/plans" className="mx-1 font-medium text-blue-600">
              套餐
            </Link>
            ，各模型倍率见
            <Link to="/models" className="mx-1 font-medium text-blue-600">
              模型广场
            </Link>
            。
          </p>
        </main>
        <CtaBandMobile title="还有其他问题？" sub="注册后可在控制台查看公告与更新日志，或联系我们。" />
      </>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-6xl px-6 py-16">
        {GROUPS.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? 'mt-14' : ''}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{group.label}</h2>
            <div className="mt-4 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white px-6">
              {group.items.map((item, ii) => (
                <details key={item.q} className="group py-5" open={gi === 0 && ii === 0}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-zinc-900">
                    {item.q}
                    <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 transition group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-500">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        ))}

        <div id="billing" className="mt-14 scroll-mt-24" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">计费规则</h2>
        <BillingRules />

        <p className="mt-8 text-sm text-zinc-500">
          查看在售套餐与价格见
          <Link to="/plans" className="mx-1 font-medium text-blue-600 hover:text-blue-700">
            套餐
          </Link>
          ，各模型倍率见
          <Link to="/models" className="mx-1 font-medium text-blue-600 hover:text-blue-700">
            模型广场
          </Link>
          。
        </p>
      </main>
      <CtaBand title="还有其他问题？" sub="注册后可在控制台查看公告与更新日志，或联系我们。" />
    </>
  );
}

/** 计费规则：额度计算说明 + 用真实套餐额度 × 真实模型倍率动态生成的换算示例；compact 为移动端紧凑版式 */
function BillingRules({ compact }: { compact?: boolean }) {
  const [plans, setPlans] = useState<SitePlan[] | null>(null);
  const [models, setModels] = useState<SiteModel[]>([]);

  useEffect(() => {
    getSitePlansApi()
      .then(setPlans)
      .catch(() => setPlans([]));
    getSiteModelsApi()
      .then(setModels)
      .catch(() => setModels([]));
  }, []);

  // 换算示例：取周期额度最高的套餐 + 倍率最低的 4 个计费模型
  const example = useMemo(() => {
    const featured =
      [...(plans ?? [])]
        .filter((p) => planQuota(p) > 0)
        .sort((a, b) => planQuota(b) - planQuota(a))[0] ?? plans?.[0];
    if (!featured || planQuota(featured) <= 0) return null;
    const rows = models
      .filter((m) => m.billing_mode === 'billable')
      .sort((a, b) => a.multiplier - b.multiplier)
      .slice(0, 4)
      .map((m) => ({
        name: m.name,
        multiplier: m.multiplier,
        calls: m.multiplier > 0 ? Math.floor(planQuota(featured) / m.multiplier) : 0,
      }));
    if (!rows.length) return null;
    return { plan: featured, rows };
  }, [plans, models]);

  const wrapCls = compact
    ? 'mx-3.5 space-y-3 rounded-[12px] border border-zinc-100 bg-white p-3 text-[11.5px] leading-[1.65] text-zinc-500'
    : 'mt-4 space-y-5 rounded-2xl border border-zinc-200 bg-white px-6 py-6 text-sm leading-relaxed text-zinc-500';
  const boxCls = compact
    ? 'rounded-[10px] border border-zinc-100 bg-zinc-50/60 p-3'
    : 'rounded-xl border border-zinc-100 bg-zinc-50/60 p-5';
  const labelCls = compact
    ? 'text-[10px] font-medium uppercase tracking-wide text-zinc-400'
    : 'text-xs font-medium uppercase tracking-wide text-zinc-400';
  const nameCls = compact ? 'font-mono text-[11.5px]' : 'font-mono text-[13px]';
  const badgeCls = compact
    ? 'ml-1.5 rounded-md bg-white px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-500'
    : 'ml-1.5 rounded-md bg-white px-1.5 py-0.5 font-mono text-xs text-zinc-500';
  const rowCls = compact ? 'py-1.5 text-zinc-600' : 'py-2.5 text-zinc-600';
  const valCls = compact ? 'py-1.5 text-right font-mono font-medium text-zinc-900' : 'py-2.5 text-right font-mono font-medium text-zinc-900';
  const footCls = compact ? 'mt-2 text-[10px] text-zinc-400' : 'mt-3 text-xs text-zinc-400';

  return (
    <div className={wrapCls}>
      <p>
        每次调用扣减<span className="font-medium text-zinc-900">「模型倍率 × 1 次」</span>
        额度。例如调用倍率 ×0.1 的模型十次共扣 1 次；调用倍率 ×3 的模型一次扣 3 次。
      </p>
      <p>
        套餐额度随周期重置：日卡为<span className="font-medium text-zinc-900">每日额度</span>、
        月卡为<span className="font-medium text-zinc-900">每月额度</span>、永久 / 按量套餐为
        <span className="font-medium text-zinc-900">总额度</span>（不重置，用完为止）。
        此外按次套餐还有<span className="font-medium text-zinc-900">滚动 5h 限额</span>，
        限制任意连续 5 小时窗口内的最大扣减量，防止程序异常刷量。额度或 5h 限额任一触达都会暂停调用，
        待额度恢复或重置后自动继续。
      </p>
      <p>额度不足时可使用兑换码即时补充，或在模型市场购买其他用户转让的额度；下个周期开始时套餐额度自动重置。</p>

      {example && (
        <div className={boxCls}>
          <div className={labelCls}>
            示例 · {example.plan.name}（{cycleLimitLabel(example.plan.category)} {formatCount(planQuota(example.plan))} 次）
          </div>
          <table className={compact ? 'mt-2 w-full text-[11.5px]' : 'mt-4 w-full text-sm'}>
            <tbody>
              {example.rows.map((r) => (
                <tr key={r.name}>
                  <td className={rowCls}>
                    <span className={nameCls}>{r.name}</span>{' '}
                    <span className={badgeCls}>×{formatMultiplier(r.multiplier)}</span>
                  </td>
                  <td className={valCls}>{formatCount(r.calls)} 次</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={footCls}>按各模型当前倍率换算，实际以调用时刻的生效倍率为准。</p>
        </div>
      )}
    </div>
  );
}

/** 套餐周期额度（total_limit 优先，兼容旧的 cycle_limit） */
function planQuota(plan: SitePlan): number {
  if (plan.total_limit && plan.total_limit > 0) return plan.total_limit;
  return plan.cycle_limit ?? 0;
}
