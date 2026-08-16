import { BookOpen, Check, Mail } from 'lucide-react';
import { CAPABILITY_META } from '@/components/CapabilityBadge';

/** 站点联系方式（占位，上线前替换为真实邮箱/群号） */
export const SITE_CONTACT_EMAIL = 'thesumwai@gmail.com';

/** 平台对外 API 地址（展示用，部署域名确定后替换） */
export const SITE_API_BASE_URL = 'https://api.tokenmp.dev/v1';

/** 区块眉题：小号大写间距标签 */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">{children}</p>;
}

/** 底部横向 CTA 卡：文案居左、按钮居右 */
export function CtaBand({ title, sub }: { title: string; sub: string }) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-zinc-900 px-10 py-12 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">{title}</h2>
          <p className="mt-2 text-sm text-zinc-400">{sub}</p>
        </div>
        <a
          href="/register"
          className="shrink-0 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
        >
          免费注册 →
        </a>
      </div>
    </section>
  );
}

/** 移动端页尾深色 CTA 卡：zinc-900 → blue-900 渐变，标题/副文/白底按钮居中竖排 */
export function CtaBandMobile({ title, sub }: { title: string; sub: string }) {
  return (
    <section className="px-4 pb-5 pt-3.5">
      <div className="rounded-[14px] bg-gradient-to-br from-zinc-900 to-blue-900 px-4 py-[15px] text-center text-white">
        <h2 className="text-[15px] font-extrabold tracking-tight">{title}</h2>
        <p className="mt-[5px] text-[11px] text-white/70">{sub}</p>
        <a
          href="/register"
          className="mx-auto mt-3 flex h-[38px] w-[150px] items-center justify-center rounded-[10px] bg-white text-[13px] font-bold text-zinc-900 transition hover:bg-zinc-200"
        >
          免费注册 →
        </a>
      </div>
    </section>
  );
}

/** 深色终端窗口：Hero 代码示例 */
export function CodeWindow() {
  return (
    <div className="overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-zinc-900/10">
      <div className="flex items-center gap-2 border-b border-zinc-800/80 px-5 py-3.5">
        <span className="h-3 w-3 rounded-full bg-zinc-700" />
        <span className="h-3 w-3 rounded-full bg-zinc-700" />
        <span className="h-3 w-3 rounded-full bg-zinc-700" />
        <span className="ml-3 text-xs text-zinc-500">chat.py</span>
        <span className="ml-auto rounded-md bg-zinc-800/80 px-2 py-0.5 text-[11px] text-zinc-400">只改 2 行配置</span>
      </div>
      <pre className="overflow-x-auto p-6 text-[13px] leading-7 text-zinc-300">
        <code>
          <span className="text-zinc-500">{'# 只改 base_url 和 api_key，其余代码零改动\n'}</span>
          {'client = OpenAI(\n    api_key='}
          <span className="text-emerald-400">&quot;tmp-****&quot;</span>
          {',\n    base_url='}
          <span className="text-emerald-400">&quot;https://api.tokenmp.dev/v1&quot;</span>
          {',\n)\nresp = client.chat.completions.create(\n    model='}
          <span className="text-emerald-400">&quot;glm-4.7&quot;</span>
          {',\n    messages=[{'}
          <span className="text-emerald-400">&quot;role&quot;</span>
          {': '}
          <span className="text-emerald-400">&quot;user&quot;</span>
          {',\n              '}
          <span className="text-emerald-400">&quot;content&quot;</span>
          {': '}
          <span className="text-emerald-400">&quot;你好&quot;</span>
          {'}],\n)'}
        </code>
      </pre>
    </div>
  );
}

/** Hero 操作按钮组：注册（主）/ 联系我们（次） */
export function HeroActions() {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <a
        href="/register"
        className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700"
      >
        <Check className="h-4 w-4" />
        免费注册
      </a>
      <a
        href={`mailto:${SITE_CONTACT_EMAIL}`}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
      >
        <Mail className="h-4 w-4" />
        联系我们
      </a>
      <a
        href="/docs/"
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
      >
        <BookOpen className="h-4 w-4" />
        接入文档
      </a>
    </div>
  );
}

/** 倍率徽章：低价绿 / 高价琥珀 / 常规灰；免费模型单独标识 */
export function MultiplierBadge({ multiplier, billingMode }: { multiplier: number; billingMode?: string }) {
  if (billingMode === 'free_global') {
    return (
      <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs font-medium text-emerald-700">免费</span>
    );
  }
  const text = `×${formatMultiplier(multiplier)}`;
  const cls =
    multiplier < 0.5
      ? 'bg-emerald-50 text-emerald-700'
      : multiplier >= 3
        ? 'bg-amber-50 text-amber-700'
        : 'bg-zinc-100 text-zinc-600';
  return <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-medium ${cls}`}>{text}</span>;
}

/** 能力标签文本（复用 panel 的能力元数据，保持两端口径一致） */
export function capabilityText(capabilities: string[]): string {
  if (!capabilities.length) return '—';
  return capabilities.map((c) => CAPABILITY_META[c]?.label ?? c).join(' · ');
}

/** token 数格式化：128000 → 128K，1500000 → 1.5M */
export function formatTokens(n: number): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/** 倍率格式化：1 → 1、0.5 → 0.5、0.75 → 0.75（最多两位小数、去尾零） */
export function formatMultiplier(m: number): string {
  return String(Number(m.toFixed(2)));
}

/** 通用数字格式化（带千分位） */
export function formatCount(n: number): string {
  return n.toLocaleString('zh-CN');
}
