import { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkline } from '@/components/Sparkline';
import { ProviderLogo } from '@/components/ProviderLogo';
import { getModelKeyHealthApi } from '@/api/panel';
import { formatCompact } from '@/utils/format';
import type { AiModelItem, AiModelProvider } from '@/types/upstream';

const formatPrice = (price: number | null): string => (price == null ? '—' : `¥${(price * 1_000_000).toFixed(2)}/M`);

/**
 * 模型的供应商映射弹窗（列表 + 倍率高亮 + 选择器复制 + 近 24h 成功趋势）。
 * 卡片视图与表格视图共用。
 */
export function ProviderMappingsDialog({ model, open, onOpenChange }: {
  model: AiModelItem;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{model.display_name || model.name} · 供应商映射</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {providers.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">暂无可用供应商</div>
          ) : (
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
                          onClick={() => {
                            const selector = `${model.name}@${group.providerKey}`;
                            navigator.clipboard.writeText(selector);
                            toast.success(`已复制选择器：${selector}`);
                          }}
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
