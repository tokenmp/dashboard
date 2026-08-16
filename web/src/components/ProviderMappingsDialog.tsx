import { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkline } from '@/components/Sparkline';
import { ProviderLogo } from '@/components/ProviderLogo';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { getModelKeyHealthApi } from '@/api/panel';
import { formatCompact } from '@/utils/format';
import type { AiModelItem, AiModelProvider } from '@/types/upstream';

const formatPrice = (price: number | null): string => (price == null ? '—' : `¥${(price * 1_000_000).toFixed(2)}/M`);

/**
 * 模型的供应商映射弹窗（列表 + 倍率高亮 + 选择器复制 + 近 24h 成功趋势）。
 * 桌面：横向信息行；移动：纵向供应商卡（logo/名称/徽标分行，选择器整行可复制，Key 两行式）。
 */
export function ProviderMappingsDialog({ model, open, onOpenChange }: {
  model: AiModelItem;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const providers = model.providers ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, { providerName: string; providerKey: string; first: AiModelProvider; keys: AiModelProvider[] }>();
    for (const p of providers) {
      const name = p.provider_display_name || p.provider_name;
      if (!map.has(p.provider_name)) {
        map.set(p.provider_name, { providerName: name, providerKey: p.provider_name, first: p, keys: [] });
      }
      map.get(p.provider_name)!.keys.push(p);
    }
    return Array.from(map.values());
  }, [providers]);

  const [healthData, setHealthData] = useState<Record<string, number[]>>({});
  const [healthLoading, setHealthLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setHealthLoading(true);
    getModelKeyHealthApi(model.id)
      .then((data) => {
        if (!active) return;
        const map: Record<string, number[]> = {};
        for (const item of data) {
          map[item.upstream_key_id] = item.series.map((point) => point.success);
        }
        setHealthData(map);
      })
      .catch(() => { if (active) setHealthData({}); })
      .finally(() => { if (active) setHealthLoading(false); });
    return () => { active = false; };
  }, [open, model.id]);

  const copySelector = (providerKey: string) => {
    const selector = `${model.name}@${providerKey}`;
    navigator.clipboard.writeText(selector);
    toast.success(`已复制选择器：${selector}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className={isMobile ? 'pr-6 text-left text-[15px]' : undefined}>
            {model.display_name || model.name} · 供应商映射
          </DialogTitle>
        </DialogHeader>
        <div className={isMobile ? 'max-h-[70dvh] overflow-y-auto' : 'max-h-[60vh] overflow-y-auto'}>
          {providers.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">暂无可用供应商</div>
          ) : isMobile ? (
            /* ── 移动端：纵向供应商卡 ── */
            <div className="space-y-[7px]">
              {grouped.map((group) => {
                const activeCount = group.keys.filter((key) => key.status === 'active').length;
                const totalCount = group.keys.length;
                const allActive = activeCount === totalCount;
                const eff = group.keys[0]?.effective_multiplier ?? 1;
                const maxTokens = Math.max(...group.keys.map((key) => key.max_tokens ?? 0));
                const inputPrices = group.keys.map((key) => key.input_price_per_token).filter((v): v is number => v != null);
                const outputPrices = group.keys.map((key) => key.output_price_per_token).filter((v): v is number => v != null);
                const inputPrice = inputPrices.length ? Math.min(...inputPrices) : null;
                const outputPrice = outputPrices.length ? Math.min(...outputPrices) : null;

                return (
                  <div key={group.providerName} className="rounded-xl border p-3">
                    {/* 行1：logo + 供应商名 + 可用性徽标 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <ProviderLogo
                          provider={{
                            id: group.first.provider_id,
                            name: group.first.provider_name,
                            display_name: group.first.provider_display_name,
                            logo_url: group.first.provider_logo_url,
                            logo_svg: group.first.provider_logo_svg,
                          }}
                          size={20}
                        />
                        <span className="truncate text-[13px] font-semibold">{group.providerName}</span>
                        {eff !== 1 && (
                          <Badge className="shrink-0 border-amber-300 bg-amber-100 text-[10px] text-amber-700">×{eff} 扣费</Badge>
                        )}
                      </div>
                      <Badge variant={allActive ? 'secondary' : 'destructive'} className="shrink-0 text-[10px]">
                        {allActive ? `${totalCount} Key` : `${activeCount}/${totalCount} 可用`}
                      </Badge>
                    </div>

                    {/* 行2：选择器（整行可点复制） */}
                    <button
                      type="button"
                      onClick={() => copySelector(group.providerKey)}
                      className="mt-1.5 flex w-full items-center gap-1 rounded-lg bg-muted px-2 py-1 text-left transition-colors active:bg-accent"
                      title="复制选择器"
                    >
                      <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
                        {model.name}@{group.providerKey}
                      </span>
                      <Copy className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/60" />
                    </button>

                    {/* 行3：指标两列 */}
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] leading-[1.45]">
                      <div className="flex gap-1.5">
                        <span className="text-muted-foreground">最大输出</span>
                        <span className="tabular-nums">{maxTokens ? formatCompact(maxTokens) : '—'}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <span className="text-muted-foreground">倍率</span>
                        <span className="tabular-nums">{eff}×</span>
                      </div>
                      <div className="flex min-w-0 gap-1.5">
                        <span className="shrink-0 text-muted-foreground">输入价</span>
                        <span className="truncate tabular-nums">{formatPrice(inputPrice)}</span>
                      </div>
                      <div className="flex min-w-0 gap-1.5">
                        <span className="shrink-0 text-muted-foreground">输出价</span>
                        <span className="truncate tabular-nums">{formatPrice(outputPrice)}</span>
                      </div>
                    </div>

                    {/* 行4：Key 列表（两行式） */}
                    <div className="mt-2 space-y-1.5">
                      {group.keys.map((key) => (
                        <div key={key.mapping_id} className="rounded-lg bg-muted/50 px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className={key.status === 'active' ? 'shrink-0 text-green-600' : 'shrink-0 text-red-600'}>●</span>
                              <span title={key.upstream_key_id} className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                …{key.upstream_key_id.slice(-8)}
                              </span>
                              {key.upstream_model_name && key.upstream_model_name !== model.name && (
                                <span className="min-w-0 truncate text-[10px] text-muted-foreground/70">→ {key.upstream_model_name}</span>
                              )}
                            </div>
                            <div className="shrink-0">
                              {healthLoading ? (
                                <Skeleton className="h-4 w-14" />
                              ) : (
                                <Sparkline data={healthData[key.upstream_key_id] ?? []} width={56} height={16} />
                              )}
                            </div>
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                            <span>出 <span className="text-foreground tabular-nums">{key.max_tokens ? formatCompact(key.max_tokens) : '—'}</span></span>
                            <span>{formatPrice(key.input_price_per_token)} / {formatPrice(key.output_price_per_token)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── 桌面：原横向信息行（零改动） ── */
            <div className="space-y-3">
              {grouped.map((group) => {
                const activeCount = group.keys.filter((key) => key.status === 'active').length;
                const totalCount = group.keys.length;
                const allActive = activeCount === totalCount;
                const maxTokens = Math.max(...group.keys.map((key) => key.max_tokens ?? 0));
                const inputPrices = group.keys.map((key) => key.input_price_per_token).filter((value): value is number => value != null);
                const outputPrices = group.keys.map((key) => key.output_price_per_token).filter((value): value is number => value != null);
                const inputPrice = inputPrices.length ? Math.min(...inputPrices) : null;
                const outputPrice = outputPrices.length ? Math.min(...outputPrices) : null;

                return (
                  <div key={group.providerName} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ProviderLogo
                          provider={{
                            id: group.first.provider_id,
                            name: group.first.provider_name,
                            display_name: group.first.provider_display_name,
                            logo_url: group.first.provider_logo_url,
                            logo_svg: group.first.provider_logo_svg,
                          }}
                          size={18}
                        />
                        <span className="font-medium">{group.providerName}</span>
                        {(() => { const eff = group.keys[0]?.effective_multiplier ?? 1; return eff !== 1 ? <Badge className="border-amber-400 bg-amber-100 text-[10px] text-amber-700">×{eff} 扣费</Badge> : null; })()}
                        <button
                          type="button"
                          onClick={() => copySelector(group.providerKey)}
                          className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          title="复制选择器"
                        >
                          {model.name}@{group.providerKey}
                          <Copy className="h-2.5 w-2.5" />
                        </button>
                      </div>
                      <Badge variant={allActive ? 'secondary' : 'destructive'} className="text-[10px]">
                        {totalCount} 个 Key · {allActive ? '全部可用' : `${activeCount}/${totalCount} 可用`}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>最大输出：<span className="text-foreground">{maxTokens ? formatCompact(maxTokens) : '—'}</span></span>
                      <span>输入价格：<span className="text-foreground">{formatPrice(inputPrice)}</span></span>
                      <span>输出价格：<span className="text-foreground">{formatPrice(outputPrice)}</span></span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {group.keys.map((key) => (
                        <div key={key.mapping_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded bg-muted/50 px-2 py-1">
                          <span className={key.status === 'active' ? 'text-green-600' : 'text-red-600'}>●</span>
                          <span title={key.upstream_key_id} className="font-mono text-[10px] text-muted-foreground">{key.upstream_key_id.slice(-10)}</span>
                          {key.upstream_model_name && key.upstream_model_name !== model.name && (
                            <span className="truncate text-[10px] text-muted-foreground/70">→ {key.upstream_model_name}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            <span className="text-foreground">{key.max_tokens ? formatCompact(key.max_tokens) : '—'}</span> · {formatPrice(key.input_price_per_token)} / {formatPrice(key.output_price_per_token)}
                          </span>
                          <div className="ml-auto shrink-0">
                            {healthLoading ? (
                              <Skeleton className="h-5 w-20" />
                            ) : (
                              <Sparkline data={healthData[key.upstream_key_id] ?? []} width={80} height={20} />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
