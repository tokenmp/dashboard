import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import ModelIcon, { findModelIcon } from '@/components/ModelIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { getSiteModelsApi } from '@/api/site';
import type { SiteModel } from '@/types/site';
import { CtaBand, MultiplierBadge, capabilityText, formatTokens } from './components';

/**
 * 模型广场：数据来自公开接口 /api/v1/site/models（模型目录 + 当前时刻倍率）。
 * 供应商筛选按模型实际挂载的供应商聚合。
 */
export default function Models() {
  const [models, setModels] = useState<SiteModel[] | null>(null);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState<string>('');
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    getSiteModelsApi()
      .then(setModels)
      .catch(() => setError('模型目录加载失败，请稍后重试'));
  }, []);

  // 供应商聚合：按名称去重，保留出现次数用于标签
  const providers = useMemo(() => {
    if (!models) return [];
    // name → { count, logo（取任一非空；同一供应商各模型携带的信息一致） }
    const agg = new Map<string, { count: number; logo: string | null }>();
    for (const m of models) {
      for (const p of m.providers) {
        const cur = agg.get(p.name);
        agg.set(p.name, {
          count: (cur?.count ?? 0) + 1,
          logo: cur?.logo ?? p.logo,
        });
      }
    }
    return [...agg.entries()]
      .map(([name, v]) => ({ name, count: v.count, logo: v.logo }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [models]);

  const filtered = useMemo(() => {
    if (!models) return [];
    const kw = keyword.trim().toLowerCase();
    return models.filter((m) => {
      const hitProvider = !provider || m.providers.some((p) => p.name === provider);
      const hitKeyword =
        !kw || m.name.toLowerCase().includes(kw) || (m.display_name ?? '').toLowerCase().includes(kw);
      return hitProvider && hitKeyword;
    });
  }, [models, provider, keyword]);

  return (
    <>
      <main className="mx-auto max-w-6xl px-6 py-14">
      {/* 供应商筛选 + 搜索 */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div className="flex flex-wrap gap-2">
          <ProviderChip active={provider === ''} onClick={() => setProvider('')}>
            全部{models ? ` (${models.length})` : ''}
          </ProviderChip>
          {providers.map((p) => (
            <ProviderChip
              key={p.name}
              active={provider === p.name}
              onClick={() => setProvider(p.name)}
              name={p.name}
              logo={p.logo}
            >
              {p.name} ({p.count})
            </ProviderChip>
          ))}
        </div>
        <div className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-400 shadow-sm md:w-auto">
          <Search className="h-4 w-4" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索模型名称…"
            className="w-full bg-transparent text-zinc-700 outline-none placeholder:text-zinc-400"
          />
        </div>
      </div>

      {/* 模型表格 */}
      {error ? (
        <p className="mt-8 rounded-2xl border border-dashed border-zinc-200 px-6 py-10 text-center text-sm text-zinc-400">{error}</p>
      ) : models === null ? (
        <ModelsTableSkeleton />
      ) : filtered.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-zinc-200 px-6 py-10 text-center text-sm text-zinc-400">
          没有符合条件的模型
        </p>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/60 text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="px-6 py-4 font-medium">模型</th>
                <th className="px-6 py-4 font-medium">供应商</th>
                <th className="px-6 py-4 font-medium">倍率</th>
                <th className="px-6 py-4 font-medium">上下文</th>
                <th className="hidden px-6 py-4 font-medium md:table-cell">支持能力</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((m) => (
                <tr key={m.id} className="transition hover:bg-zinc-50/60">
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-2.5">
                      <ModelIcon id={m.name} displayName={m.display_name ?? undefined} size={24} />
                      <span className="font-mono text-[13px] font-medium text-zinc-900">{m.name}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    {m.providers.length > 1 ? `${m.providers[0].name} 等 ${m.providers.length} 家` : m.owned_by}
                  </td>
                  <td className="px-6 py-4">
                    <MultiplierBadge multiplier={m.multiplier} billingMode={m.billing_mode} />
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-zinc-500">{formatTokens(m.context_window)}</td>
                  <td className="hidden px-6 py-4 text-zinc-500 md:table-cell">{capabilityText(m.capabilities)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-col items-start justify-between gap-2 border-t border-zinc-100 px-6 py-4 text-xs text-zinc-400 sm:flex-row sm:items-center">
            <span>共 {filtered.length} 个模型</span>
            <span>倍率为当前时刻生效值，计费说明详见常见问题</span>
          </div>
        </div>
      )}

      </main>
      <CtaBand title="所有模型，一个密钥全通用" sub="注册后即可调用以上全部模型。" />
    </>
  );
}

/** 模型表骨架屏：与真实表格同构（图标+名称 / 供应商 / 倍率徽章 / 上下文 / 能力五列） */
function ModelsTableSkeleton() {
  const rows = [90, 70, 85, 60, 75, 65, 80, 55];
  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      {/* 表头 */}
      <div className="flex items-center gap-6 border-b border-zinc-100 bg-zinc-50/60 px-6 py-4">
        {['模型', '供应商', '倍率', '上下文'].map((h) => (
          <span key={h} className="text-xs font-medium uppercase tracking-wide text-zinc-300">
            {h}
          </span>
        ))}
        <span className="hidden text-xs font-medium uppercase tracking-wide text-zinc-300 md:inline">支持能力</span>
      </div>
      {/* 行 */}
      {rows.map((w, i) => (
        <div
          key={i}
          className="grid items-center gap-6 border-b border-zinc-100 px-6 py-4 last:border-b-0 md:grid-cols-[minmax(0,2.2fr)_1fr_0.6fr_0.6fr_1.4fr]"
        >
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-6 w-6 rounded-md" />
            <Skeleton className="h-4" style={{ width: `${w}%`, maxWidth: 220 }} />
          </div>
          <Skeleton className="hidden h-4 w-20 md:block" />
          <Skeleton className="hidden h-5 w-12 rounded-md md:block" />
          <Skeleton className="hidden h-4 w-14 md:block" />
          <Skeleton className="hidden h-4 md:block" style={{ width: `${Math.min(w, 85)}%` }} />
        </div>
      ))}
    </div>
  );
}

function ProviderChip({
  active,
  onClick,
  children,
  name,
  logo,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  name?: string;
  logo?: string | null;
}) {
  // 优先用后台配置的供应商 Logo；未配置时按名称回退内置品牌图标匹配库
  const match = !logo && name ? findModelIcon(name) : undefined;
  const src = logo ?? (match ? `/model-icons/${match.icon}.svg` : null);
  const bg = logo
    ? active ? '#ffffff18' : 'transparent'
    : active ? '#ffffff30' : (match?.logoBackground ?? 'transparent');
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition ${
        active
          ? 'bg-zinc-900 font-medium text-white'
          : 'border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900'
      }`}
    >
      {src && (
        <span
          className="inline-block h-4 w-4 shrink-0 rounded-sm"
          style={{ background: `${bg} url("${src}") center / contain no-repeat` }}
        />
      )}
      {children}
    </button>
  );
}
