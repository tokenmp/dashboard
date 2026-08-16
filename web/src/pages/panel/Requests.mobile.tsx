import { useEffect, useState } from 'react';
import { RefreshCw, Search, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { getPanelRequestsApi, getPanelKeysApi, getPanelRequestDetailApi } from '@/api/panel';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useUrlQueryState } from '@/hooks/useUrlQueryState';
import { useAsync } from '@/hooks/useAsync';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DebouncedInput } from '@/components/DebouncedInput';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Sheet,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ModelIcon } from '@/components/ModelIcon';
import {
  MobileCard,
  FilterChip,
  FilterChipRow,
  MobileFilterSheet,
  MobileFilterField,
  MobilePagination,
  MobilePageHeader,
  DetailSheetContent,
} from '@/components/mobile';
import type { MobileCardField } from '@/components/mobile';
import { formatCompact, formatDateTime, formatNumber } from '@/utils/format';
import { attemptErrorLabel } from '@/utils/attempts';
import { PROTOCOLS, isDate } from './Requests';
import type { RequestLogQuery, RequestLogItem } from '@/types/request-log';

/** 状态筛选项（与桌面 FiltersBar 一致） */
const SUCCESS_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: '1', label: '成功' },
  { value: '0', label: '失败' },
];

/**
 * 用户面·我的请求记录（移动视图）：搜索框 + 筛选 chips + 卡片流 + 紧凑分页。
 * 数据 hooks、筛选状态模型与桌面视图完全一致（同一组 URL query 字段），
 * 详情为移动专属设计（MobileDetailDrawer，不复用桌面 DetailDrawer）。
 */
export function RequestsMobile() {
  const [detailId, setDetailId] = useState<string | null>(null);

  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'q', key: 'keyword' },
    { name: 'protocol', key: 'protocol' },
    { name: 'success', key: 'success' },
    { name: 'key', key: 'userApiKeyId' },
    { name: 'from', key: 'from' },
    { name: 'to', key: 'to' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getPanelRequestsApi, {
      initial: { size: 20, sort: '-created_at', ...urlInit } as RequestLogQuery,
    });
  useEffect(() => { write(params); }, [params]);

  const { data: keysData } = useAsync(getPanelKeysApi, []);
  const keys = keysData ?? [];

  /** 激活筛选字段数（筛选入口角标）；关键字有独立搜索框，不计入 */
  const activeCount = [params.protocol, params.success, params.userApiKeyId, params.from, params.to]
    .filter((v) => v !== undefined && v !== null && v !== '')
    .length;

  return (
    <div className="space-y-3">
      {/* 页头 */}
      <MobilePageHeader
        title="我的请求记录"
        action={
          <Button variant="outline" size="sm" className="h-[30px] rounded-lg px-2.5" onClick={reload} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        }
      />

      {/* 搜索 + 全量筛选入口 */}
      <div className="flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <DebouncedInput
            className="h-8 rounded-lg px-2.5 pl-8 text-xs"
            placeholder="搜索 request_id / trace_id / 模型名"
            value={params.keyword ?? ''}
            onDebouncedChange={(v) => setFilters({ keyword: v })}
          />
        </div>
        <MobileFilterSheet
          activeCount={activeCount}
          onReset={() =>
            setFilters({ keyword: '', protocol: '', success: '', userApiKeyId: '', from: '', to: '' })
          }
        >
          <MobileFilterField label="密钥">
            <Select value={params.userApiKeyId ?? 'all'} onValueChange={(v) => setFilters({ userApiKeyId: v === 'all' ? '' : v })}>
              <SelectTrigger><span className="truncate">{params.userApiKeyId ? (keys.find((k) => k.id === params.userApiKeyId)?.name ?? '全部') : '全部'}</span></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {keys.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    <div className="flex flex-col">
                      <span>{k.name}</span>
                      <span className="text-muted-foreground">{k.key_prefix}{'•'.repeat(6)}{k.key_suffix}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </MobileFilterField>
          <MobileFilterField label="起始日期">
            <DebouncedInput type="date" value={params.from ?? ''} acceptValue={isDate} onDebouncedChange={(v) => setFilters({ from: v })} />
          </MobileFilterField>
          <MobileFilterField label="结束日期">
            <DebouncedInput type="date" value={params.to ?? ''} acceptValue={isDate} onDebouncedChange={(v) => setFilters({ to: v })} />
          </MobileFilterField>
        </MobileFilterSheet>
      </div>

      {/* 高频筛选 chips：状态 / 协议（沿用页面现有筛选状态模型，即选即生效） */}
      <FilterChipRow className="-mx-4">
        <FilterChip
          label="状态"
          options={SUCCESS_OPTIONS}
          value={params.success ?? ''}
          onChange={(v) => setFilters({ success: v === 'all' ? '' : v })}
        />
        <FilterChip
          label="协议"
          options={[{ value: 'all', label: '全部' }, ...PROTOCOLS.map((p) => ({ value: p, label: p }))]}
          value={params.protocol ?? ''}
          onChange={(v) => setFilters({ protocol: v === 'all' ? '' : v })}
        />
      </FilterChipRow>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-2.5 text-[13px] text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* 卡片流 */}
      {loading && list.length === 0 ? (
        <div className="space-y-[7px]">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="暂无请求日志" description="尝试调整筛选条件或刷新" />
      ) : (
        <div className="space-y-[7px]">
          {list.map((r) => (
            <RequestCard key={r.id} log={r} onClick={() => setDetailId(r.id)} />
          ))}
        </div>
      )}

      {/* 分页 */}
      {total > 0 && <MobilePagination page={page} size={size} total={total} onPageChange={setPage} />}

      {/* 详情（移动专属设计，底部抽屉） */}
      <MobileDetailDrawer id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

/* ----------------------------- 请求卡片 ----------------------------- */

/** 单条请求的移动卡片：标题=模型、徽标=状态、副行=时间+密钥名，字段取自页面真实列。 */
function RequestCard({ log, onClick }: { log: RequestLogItem; onClick: () => void }) {
  // 字段与桌面列同源：ID（request_id 尾段）、Token 入/出、耗时、首字输出；失败请求追加错误码
  const fields: MobileCardField[] = [
    { key: 'id', label: 'ID', value: <span className="font-mono">{log.request_id ? log.request_id.slice(-10) : '—'}</span> },
    { key: 'tokens', label: 'Token 入/出', value: `${log.input_tokens !== null ? formatCompact(log.input_tokens) : '—'} / ${log.output_tokens !== null ? formatCompact(log.output_tokens) : '—'}` },
    { key: 'latency', label: '耗时', value: log.latency_ms !== null ? `${formatNumber(log.latency_ms)}ms` : '—' },
    { key: 'ttft', label: '首字输出', value: log.stream && log.ttft_ms ? `${formatNumber(log.ttft_ms)}ms` : '—' },
  ];
  if (log.success === false && log.error_code) {
    fields.push({ key: 'error', label: '错误', value: attemptErrorLabel(log.error_code) ?? log.error_code });
  }

  return (
    <MobileCard
      title={
        <span className="flex min-w-0 items-center gap-1.5">
          <ModelIcon id={log.model_name ?? ''} displayName={log.model_name ?? undefined} size={16} />
          <span className="truncate">{log.model_name || '—'}</span>
        </span>
      }
      badge={
        <StatusBadge
          status={log.success === null ? 'pending' : log.success ? 'success' : 'failed'}
          map={{ pending: { variant: 'outline', label: '进行中' } }}
        />
      }
      subtitle={
        <>
          {formatDateTime(log.created_at)}
          {log.api_key_name ? ` · ${log.api_key_name}` : ''}
        </>
      }
      fields={fields}
      onClick={onClick}
    />
  );
}

/* ------------------------- 详情 · 移动专属设计 ------------------------- */

/** 指标格：弱底大数字（移动端风格，替代桌面的边框三格） */
function MetricCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-2.5">
      <div className="text-[10.5px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-lg font-bold tabular-nums">{value}</span>
        {sub && <span className="text-[10px] text-muted-foreground tabular-nums">{sub}</span>}
      </div>
    </div>
  );
}

/** 明细行 */
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2 text-[11.5px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all text-right">{value}</span>
    </div>
  );
}

/**
 * 请求详情·移动专属：头部（模型+状态+request_id 可复制）→ 2×2 关键指标（或错误卡）
 * → 明细行列表 → 上游尝试。不复用桌面 DetailDrawer 的栅格布局。
 */
function MobileDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, loading, error } = useAsync(
    () => (id ? getPanelRequestDetailApi(id) : Promise.resolve(null)),
    [id],
  );

  const log = data?.log;
  const failed = log?.success === false;
  const tps =
    log && log.stream && log.ttft_ms && log.latency_ms !== null && log.latency_ms > log.ttft_ms && log.output_tokens
      ? Math.round((log.output_tokens / (log.latency_ms - log.ttft_ms)) * 1000)
      : null;

  const copyRequestId = () => {
    if (!log?.request_id) return;
    navigator.clipboard.writeText(log.request_id);
    toast.success('已复制请求 ID');
  };

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DetailSheetContent>
        <SheetHeader>
          <SheetTitle className="text-left text-[15px]">请求详情</SheetTitle>
        </SheetHeader>

        {id === null ? null : loading ? null : error ? (
          <div className="px-1 text-[12px] text-destructive">{error}</div>
        ) : log ? (
          <div className="space-y-2.5">
            {/* 头部：模型 + 状态 + 时间/密钥 + request_id */}
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ModelIcon id={log.model_name ?? ''} size={22} />
                  <span className="truncate text-[15px] font-bold">{log.model_name || '—'}</span>
                </div>
                <StatusBadge status={log.usage_status} />
              </div>
              <div className="mt-1 text-[10.5px] text-muted-foreground">
                {formatDateTime(log.created_at)}
                {log.api_key_name ? ` · ${log.api_key_name}` : ''}
              </div>
              {log.request_id && (
                <button
                  type="button"
                  onClick={copyRequestId}
                  className="mt-1.5 flex w-full items-center gap-1 rounded-lg bg-muted px-2 py-1 text-left"
                >
                  <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">{log.request_id}</span>
                  <Copy className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/60" />
                </button>
              )}
            </div>

            {/* 关键指标 2×2（失败请求改为错误卡） */}
            {failed ? (
              (log.error_code || log.error_message) && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
                  <div className="text-[12.5px] font-semibold text-destructive">{log.error_code ?? '请求失败'}</div>
                  {log.error_message && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{log.error_message}</p>}
                  {(log.provider_error_code || log.provider_http_status) && (
                    <p className="mt-1 text-[10.5px] text-muted-foreground">
                      上游：{log.provider_error_code ?? '—'} / HTTP {log.provider_http_status ?? '—'}
                    </p>
                  )}
                </div>
              )
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <MetricCell
                  label="Token 输入"
                  value={log.input_tokens != null ? formatCompact(Math.max(0, log.input_tokens - (log.cache_tokens ?? 0))) : '—'}
                  sub={log.cache_tokens ? `+${formatCompact(log.cache_tokens)} 缓存` : undefined}
                />
                <MetricCell label="Token 输出" value={log.output_tokens != null ? formatCompact(log.output_tokens) : '—'} />
                <MetricCell label="总耗时" value={log.latency_ms != null ? `${formatNumber(log.latency_ms)}ms` : '—'} />
                <MetricCell label="首字输出" value={log.stream && log.ttft_ms ? `${formatNumber(log.ttft_ms)}ms` : '—'} />
              </div>
            )}

            {/* 明细行 */}
            <div className="divide-y divide-muted rounded-xl border">
              <DetailRow label="协议" value={`${log.protocol ?? '—'}${log.stream ? ' · 流式' : ''}`} />
              <DetailRow label="密钥" value={log.api_key_name ?? '—'} />
              <DetailRow label="路由组" value={log.route_group_name ?? 'default'} />
              <DetailRow label="思考程度" value={log.thinking_mode ? (log.thinking_effort ?? '—') : '—'} />
              <DetailRow label="计费" value={log.billing_plan_name ?? '—'} />
              {tps !== null && <DetailRow label="推理速度" value={`${formatNumber(tps)} tok/s`} />}
              {log.final_status_code != null && <DetailRow label="状态码" value={String(log.final_status_code)} />}
            </div>

            {/* 上游尝试 */}
            {(data?.attempts?.length ?? 0) > 0 && (
              <div className="rounded-xl border p-3">
                <div className="text-[11px] font-semibold text-muted-foreground">上游尝试（{data!.attempts.length}）</div>
                <div className="mt-1.5 space-y-1.5">
                  {data!.attempts.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-[11px]">
                      <span className="shrink-0 text-muted-foreground">#{a.attempt_index}</span>
                      <span className="min-w-0 flex-1 truncate">{a.provider_name ?? a.upstream_key_name ?? '—'}</span>
                      <span className={a.error_code ? 'shrink-0 text-destructive' : 'shrink-0 text-emerald-600'}>
                        {a.error_code ? attemptErrorLabel(a.error_code) : a.status_code ?? '—'}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {a.latency_ms != null ? `${formatNumber(a.latency_ms)}ms` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </DetailSheetContent>
    </Sheet>
  );
}
