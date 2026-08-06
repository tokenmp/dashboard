import { useEffect, useState } from 'react';
import { ChevronRight, RefreshCw, Search } from 'lucide-react';
import { getPanelModelsApi } from '@/api/panel';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useUrlQueryState } from '@/hooks/useUrlQueryState';
import { DebouncedInput } from '@/components/DebouncedInput';
import { EmptyState } from '@/components/EmptyState';
import { ModelIcon } from '@/components/ModelIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact, formatNumber } from '@/utils/format';
import type { AiModelItem, UpstreamQuery } from '@/types/upstream';

function formatPrice(price: number | null): string {
  if (price == null) return '—';
  return `¥${(price * 1_000_000).toFixed(2)}/M`;
}

function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <DebouncedInput
        className="pl-8"
        placeholder="搜索 name / display_name"
        value={value}
        onDebouncedChange={onChange}
      />
    </div>
  );
}

function ModelBillingSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">全部</SelectItem>
        <SelectItem value="billable">billable</SelectItem>
        <SelectItem value="free_global">free_global</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ModelCard({ model }: { model: AiModelItem }) {
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const providers = model.providers ?? [];

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <ModelIcon id={model.name} displayName={model.display_name ?? undefined} size={36} />
              <div className="min-w-0">
                <div className="truncate font-medium">{model.display_name || model.name}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">{model.name}</div>
              </div>
            </div>
            <Badge
              variant={model.billing_mode === 'free_global' ? 'secondary' : 'default'}
              className="shrink-0 text-[10px]"
            >
              {model.billing_mode}
            </Badge>
          </div>
          {model.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{model.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {(model.capabilities ?? []).map((capability) => (
              <Badge key={capability} variant="outline" className="text-[10px]">{capability}</Badge>
            ))}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            上下文窗口：{model.context_window_tokens ? formatCompact(model.context_window_tokens) : '—'}
          </div>
          <button
            type="button"
            className="mt-2 flex w-full items-center justify-between border-t pt-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setProviderDialogOpen(true)}
          >
            <span>供应商映射（{providers.length}）</span>
            <ChevronRight className="h-3 w-3" />
          </button>
        </CardContent>
      </Card>
      <Dialog open={providerDialogOpen} onOpenChange={setProviderDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{model.display_name || model.name} · 供应商映射</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {providers.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">暂无可用供应商</div>
            ) : (
              <div className="space-y-2">
                {providers.map((provider) => (
                  <div key={provider.mapping_id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {provider.provider_display_name || provider.provider_name}
                      </span>
                      <Badge variant="outline" className="text-[10px]">{provider.status}</Badge>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <div>上游 Key：<span className="text-foreground">{provider.upstream_key_name}</span></div>
                      {provider.upstream_model_name && provider.upstream_model_name !== model.name && (
                        <div>转发名：<span className="font-mono text-foreground">{provider.upstream_model_name}</span></div>
                      )}
                      <div>最大输出：<span className="text-foreground">{provider.max_tokens ? formatCompact(provider.max_tokens) : '—'}</span></div>
                      <div>输入价格：<span className="text-foreground">{formatPrice(provider.input_price_per_token)}</span></div>
                      <div>输出价格：<span className="text-foreground">{formatPrice(provider.output_price_per_token)}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModelPagination({
  page,
  size,
  total,
  loading,
  onPageChange,
}: {
  page: number;
  size: number;
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / size));

  return (
    <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <span>第 {page} / {pages} 页 · 每页 {size} 条 · 共 {formatNumber(total)} 条</span>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(page - 1)}
            >
              上一页
            </Button>
          </PaginationItem>
          <PaginationItem>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages || loading}
              onClick={() => onPageChange(page + 1)}
            >
              下一页
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

function Models() {
  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'q', key: 'keyword' },
    { name: 'billing', key: 'billingMode' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getPanelModelsApi, {
      initial: { size: 20, sort: 'created_at', ...urlInit } as UpstreamQuery,
    });

  useEffect(() => { write(params); }, [params]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">模型目录</h1>
          <p className="mt-1 text-sm text-muted-foreground">平台当前可用模型 · 共 {formatNumber(total)} 个</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">名称搜索</label>
            <SearchInput
              value={params.keyword ?? ''}
              onChange={(value) => setFilters({ keyword: value })}
            />
          </div>
          <div className="w-[160px]">
            <label className="mb-1 block text-xs text-muted-foreground">计费模式</label>
            <ModelBillingSelect
              value={params.billingMode ?? 'all'}
              onChange={(value) => setFilters({ billingMode: value === 'all' ? '' : value })}
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading && list.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-52" />)}
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="暂无模型" description="尝试调整搜索或计费模式筛选" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((model) => <ModelCard key={model.id} model={model} />)}
        </div>
      )}

      <ModelPagination
        page={page}
        size={size}
        total={total}
        loading={loading}
        onPageChange={setPage}
      />
    </div>
  );
}

export default Models;
