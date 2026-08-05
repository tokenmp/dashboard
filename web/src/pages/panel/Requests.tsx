import { useState } from 'react';
import { RefreshCw, Search, ChevronRight, Clock, Cpu, Activity, AlertTriangle } from 'lucide-react';
import { getPanelRequestsApi, getPanelRequestDetailApi } from '@/api/panel';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAsync } from '@/hooks/useAsync';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DebouncedInput } from '@/components/DebouncedInput';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCompact, formatNumber } from '@/utils/format';
import type {
  RequestLogQuery,
  RequestLogDetail,
  RequestAttemptItem,
} from '@/types/request-log';

const PROTOCOLS = ['openai', 'anthropic', 'openai_chat', 'openai_responses', 'anthropic_messages', 'image_generation', 'tokenmp_gateway', 'custom'];
const BILLING_PLANS = ['coding', 'token', 'image', 'free'];
const USAGE_STATUSES = ['final', 'pending', 'estimated', 'missing'];

/**
 * 用户面·我的请求记录：分页列表 + 详情抽屉。
 * 始终是「我的请求」视角，后端按当前用户 scope，不做管理分支。
 */
function Requests() {
  const [detailId, setDetailId] = useState<string | null>(null);

  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getPanelRequestsApi, {
      initial: { size: 20, sort: '-created_at' } as RequestLogQuery,
    });

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">我的请求记录</h1>
          <p className="mt-1 text-sm text-muted-foreground">共 {formatNumber(total)} 条</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 筛选条 */}
      <FiltersBar
        params={params}
        onFilter={setFilters}
        onReset={() =>
          setFilters({ keyword: '', model: '', protocol: '', billingPlan: '', usageStatus: '', success: '', from: '', to: '' })
        }
      />

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* 列表 */}
      <Card>
        <CardContent className="p-0">
          {loading && list.length === 0 ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState className="mx-4 my-6" title="暂无请求日志" description="尝试调整筛选条件或刷新" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">时间</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead className="w-[110px]">协议</TableHead>
                  <TableHead className="w-[90px]">计费</TableHead>
                  <TableHead className="w-[90px]">状态</TableHead>
                  <TableHead className="w-[110px] text-right">Token</TableHead>
                  <TableHead className="w-[90px] text-right">耗时</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setDetailId(r.id)}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.created_at}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="max-w-[220px] truncate">{r.model_name || '—'}</span>
                        {r.stream && (
                          <Badge variant="outline" className="px-1 py-0 text-[10px]">stream</Badge>
                        )}
                        {r.thinking_mode && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="px-1 py-0 text-[10px]">思考</Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                思考强度：{r.thinking_effort ?? '—'}
                                {r.thinking_effort_degraded ? '（已降级）' : ''}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{r.protocol ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{r.billing_plan ?? '—'}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={r.success === null ? 'pending' : r.success ? 'success' : 'failed'}
                        map={{ pending: { variant: 'outline', label: '进行中' } }}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.total_tokens !== null ? formatCompact(r.total_tokens) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {r.latency_ms !== null ? `${formatNumber(r.latency_ms)}ms` : '—'}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 分页 */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            第 {page} / {Math.max(1, Math.ceil(total / size))} 页 · 每页 {size} 条
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
              上一页
            </Button>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / size) || loading} onClick={() => setPage(page + 1)}>
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* 详情抽屉 */}
      <DetailDrawer id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

/* ----------------------------- 筛选条 ----------------------------- */

function FiltersBar({
  params,
  onFilter,
  onReset,
}: {
  params: RequestLogQuery;
  onFilter: (f: Partial<RequestLogQuery>) => void;
  onReset: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs text-muted-foreground">关键字（request_id / trace_id）</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <DebouncedInput
              className="pl-8"
              placeholder="搜索 request_id / trace_id"
              value={params.keyword ?? ''}
              onDebouncedChange={(v) => onFilter({ keyword: v })}
            />
          </div>
        </div>
        <div className="w-[160px]">
          <label className="mb-1 block text-xs text-muted-foreground">模型名</label>
          <DebouncedInput
            placeholder="如 gpt-4o"
            value={params.model ?? ''}
            onDebouncedChange={(v) => onFilter({ model: v })}
          />
        </div>
        <div className="w-[140px]">
          <label className="mb-1 block text-xs text-muted-foreground">协议</label>
          <Select value={params.protocol ?? 'all'} onValueChange={(v) => onFilter({ protocol: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {PROTOCOLS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[120px]">
          <label className="mb-1 block text-xs text-muted-foreground">计费类型</label>
          <Select value={params.billingPlan ?? 'all'} onValueChange={(v) => onFilter({ billingPlan: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {BILLING_PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[130px]">
          <label className="mb-1 block text-xs text-muted-foreground">用量状态</label>
          <Select value={params.usageStatus ?? 'all'} onValueChange={(v) => onFilter({ usageStatus: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {USAGE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[120px]">
          <label className="mb-1 block text-xs text-muted-foreground">结果</label>
          <Select value={params.success ?? 'all'} onValueChange={(v) => onFilter({ success: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="1">成功</SelectItem>
              <SelectItem value="0">失败</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-[150px]">
          <label className="mb-1 block text-xs text-muted-foreground">起始日期</label>
          <DebouncedInput type="date" value={params.from ?? ''} onDebouncedChange={(v) => onFilter({ from: v })} />
        </div>
        <div className="w-[150px]">
          <label className="mb-1 block text-xs text-muted-foreground">结束日期</label>
          <DebouncedInput type="date" value={params.to ?? ''} onDebouncedChange={(v) => onFilter({ to: v })} />
        </div>
        <Button variant="ghost" size="sm" onClick={onReset}>重置</Button>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- 详情抽屉 ----------------------------- */

function DetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, loading, error } = useAsync(
    () => (id ? getPanelRequestDetailApi(id) : Promise.resolve(null)),
    [id],
  );

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>请求详情</SheetTitle>
        </SheetHeader>
        {id === null ? null : loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : data ? (
          <div className="space-y-4 p-4">
            <DetailBasic log={data.log} />
            <AttemptsSection attempts={data.attempts} />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailBasic({ log }: { log: RequestLogDetail }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: '模型', value: log.model_name || '—' },
    { label: '请求模型', value: log.requested_model_name || '—' },
    { label: '解析模型', value: log.resolved_model_name || '—' },
    { label: '协议', value: log.protocol || '—' },
    { label: '路由组', value: log.route_group_name || 'default' },
    { label: '计费', value: <Badge variant="secondary">{log.billing_plan ?? '—'}</Badge> },
    { label: '计费来源', value: log.billing_source ?? '—' },
    { label: '计费套餐', value: log.billing_plan_name ?? '—' },
    { label: '状态码', value: log.final_status_code ?? '—' },
    { label: '成功', value: <StatusBadge status={log.success === null ? 'pending' : log.success ? 'success' : 'failed'} map={{ pending: { variant: 'outline', label: '进行中' } }} /> },
    { label: '用量状态', value: <StatusBadge status={log.usage_status} /> },
    { label: '流式', value: log.stream ? '是' : '否' },
    { label: '思考模式', value: log.thinking_mode ? `${log.thinking_effort ?? '—'}${log.thinking_effort_degraded ? '（已降级）' : ''}` : '否' },
    { label: '创建时间', value: <span className="font-mono text-xs">{log.created_at}</span> },
    { label: '完成时间', value: <span className="font-mono text-xs">{log.completed_at ?? '—'}</span> },
  ];

  const tokens: { label: string; value: number | null }[] = [
    { label: '输入', value: log.input_tokens },
    { label: '输出', value: log.output_tokens },
    { label: '总计', value: log.total_tokens },
    { label: '缓存', value: log.cache_tokens },
  ];

  return (
    <>
      {/* 请求 ID 单独置顶 */}
      <div className="rounded-lg border bg-muted/40 p-3">
        <div className="text-xs text-muted-foreground">请求 ID</div>
        <div className="mt-0.5 break-all font-mono text-sm">{log.request_id || '—'}</div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {tokens.map((t) => (
          <div key={t.label} className="rounded-lg border p-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Cpu className="h-3 w-3" />{t.label} Token
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{formatCompact(t.value)}</div>
          </div>
        ))}
      </div>
      {(log.latency_ms !== null || log.ttft_ms !== null) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />总耗时</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{log.latency_ms !== null ? `${formatNumber(log.latency_ms)}ms` : '—'}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground"><Activity className="h-3 w-3" />首 Token</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{log.ttft_ms !== null ? `${formatNumber(log.ttft_ms)}ms` : '—'}</div>
          </div>
        </div>
      )}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">基本信息</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {rows.map((r) => (
              <div key={r.label} className="flex justify-between gap-2 border-b border-dashed py-1">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="text-right">{r.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      {log.error_code && (
        <Card className="border-destructive">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />{log.error_code}
            </div>
            {log.error_message && <p className="mt-1 text-xs text-muted-foreground">{log.error_message}</p>}
            {(log.provider_error_code || log.provider_http_status) && (
              <p className="mt-1 text-xs text-muted-foreground">
                上游：{log.provider_error_code ?? '—'} / HTTP {log.provider_http_status ?? '—'}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function AttemptsSection({ attempts }: { attempts: RequestAttemptItem[] }) {
  if (attempts.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">上游尝试（{attempts.length}）</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">耗时</TableHead>
              <TableHead>错误</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attempts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-xs">{a.attempt_index}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={a.status_code && a.status_code >= 200 && a.status_code < 300 ? 'default' : 'destructive'} className="text-[10px]">
                      {a.status_code ?? '—'}
                    </Badge>
                  </div>
                  <div className="mt-0.5 max-w-[200px] truncate text-xs text-muted-foreground" title={a.upstream_url ?? ''}>
                    {a.upstream_url ?? '—'}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs">{a.latency_ms !== null ? `${formatNumber(a.latency_ms)}ms` : '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {a.error_code ? (
                    <div>
                      <div className="font-medium text-destructive">{a.error_code}</div>
                      {a.error_message && <div className="max-w-[180px] truncate">{a.error_message}</div>}
                    </div>
                  ) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default Requests;
