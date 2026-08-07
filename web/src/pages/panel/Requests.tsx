import { useEffect, useState } from 'react';
import { RefreshCw, Search, ChevronRight, Clock, Cpu, Activity, AlertTriangle, Network, Brain, Zap, Wallet, CheckCircle2, Info } from 'lucide-react';
import { getPanelRequestsApi, getPanelRequestDetailApi, getPanelKeysApi } from '@/api/panel';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useUrlQueryState } from '@/hooks/useUrlQueryState';
import { useAsync } from '@/hooks/useAsync';
import { StatusBadge } from '@/components/StatusBadge';
import { ModelIcon } from '@/components/ModelIcon';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { formatCompact, formatDateTime, formatNumber } from '@/utils/format';
import { attemptErrorLabel, withAttemptPasses } from '@/utils/attempts';
import type {
  RequestLogQuery,
  RequestLogDetail,
  RequestAttemptItem,
} from '@/types/request-log';
import type { UserApiKeyItem } from '@/types/user';

const PROTOCOLS = ['openai', 'anthropic', 'openai_chat', 'openai_responses', 'anthropic_messages', 'image_generation', 'tokenmp_gateway', 'custom'];

/** 日期输入校验：空值或标准 YYYY-MM-DD（年份恰好 4 位），拒绝 6 位年份等异常输入 */
const isDate = (v: string) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * 用户面·我的请求记录：分页列表 + 详情抽屉。
 * 始终是「我的请求」视角，后端按当前用户 scope，不做管理分支。
 */
function Requests() {
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
        keys={keys}
        onReset={() =>
          setFilters({ keyword: '', protocol: '', success: '', userApiKeyId: '', from: '', to: '' })
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
                  <TableHead className="w-[140px]">ID</TableHead>
                  <TableHead>密钥</TableHead>
                  <TableHead className="w-[110px]">协议</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead className="w-[70px]">类型</TableHead>
                  <TableHead className="w-[80px]">思考</TableHead>
                  <TableHead className="w-[110px] text-right">Token</TableHead>
                  <TableHead className="w-[90px] text-right">推理速度</TableHead>
                  <TableHead className="w-[90px] text-right">首字输出</TableHead>
                  <TableHead className="w-[90px] text-right">耗时</TableHead>
                  <TableHead className="w-[90px]">状态</TableHead>
                  <TableHead className="w-[160px]">时间</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer h-12"
                    onClick={() => setDetailId(r.id)}
                  >
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {r.request_id ? r.request_id.slice(-10) : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="max-w-[140px] truncate" title={r.api_key_name ?? ''}>{r.api_key_name ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{r.protocol ?? '—'}</span>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <ModelIcon id={r.model_name ?? ''} displayName={r.model_name ?? undefined} size={20} />
                        <span className="max-w-[220px] truncate">{r.model_name || '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.stream
                        ? <Badge variant="secondary" className="px-1.5 py-0 text-sm font-normal text-muted-foreground">流式</Badge>
                        : <span className="text-sm text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.thinking_mode ? (
                        <span className="inline-flex items-center gap-1">
                          <span>{r.thinking_effort ?? '—'}</span>
                          {r.thinking_effort_degraded && (
                            <Badge variant="outline" className="px-1 py-0 text-sm text-amber-600">降级</Badge>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.total_tokens !== null ? formatCompact(r.total_tokens) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {r.ttft_ms !== null && r.latency_ms !== null && r.latency_ms > r.ttft_ms && r.output_tokens
                        ? formatNumber(Math.round((r.output_tokens / (r.latency_ms - r.ttft_ms)) * 1000))
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {r.ttft_ms !== null ? `${formatNumber(r.ttft_ms)}ms` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {r.latency_ms !== null ? `${formatNumber(r.latency_ms)}ms` : '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={r.success === null ? 'pending' : r.success ? 'success' : 'failed'}
                        map={{ pending: { variant: 'outline', label: '进行中' } }}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {formatDateTime(r.created_at)}
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
  keys,
  onReset,
}: {
  params: RequestLogQuery;
  onFilter: (f: Partial<RequestLogQuery>) => void;
  keys: UserApiKeyItem[];
  onReset: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-sm text-muted-foreground">关键字（request_id / trace_id / 模型名）</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <DebouncedInput
              className="pl-8"
              placeholder="搜索 request_id / trace_id / 模型名"
              value={params.keyword ?? ''}
              onDebouncedChange={(v) => onFilter({ keyword: v })}
            />
          </div>
        </div>
        <div className="w-[160px]">
          <label className="mb-1 block text-sm text-muted-foreground">密钥</label>
          <Select value={params.userApiKeyId ?? 'all'} onValueChange={(v) => onFilter({ userApiKeyId: v === 'all' ? '' : v })}>
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
        </div>
        <div className="w-[140px]">
          <label className="mb-1 block text-sm text-muted-foreground">协议</label>
          <Select value={params.protocol ?? 'all'} onValueChange={(v) => onFilter({ protocol: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {PROTOCOLS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[120px]">
          <label className="mb-1 block text-sm text-muted-foreground">状态</label>
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
          <label className="mb-1 block text-sm text-muted-foreground">起始日期</label>
          <DebouncedInput type="date" value={params.from ?? ''} acceptValue={isDate} onDebouncedChange={(v) => onFilter({ from: v })} />
        </div>
        <div className="w-[150px]">
          <label className="mb-1 block text-sm text-muted-foreground">结束日期</label>
          <DebouncedInput type="date" value={params.to ?? ''} acceptValue={isDate} onDebouncedChange={(v) => onFilter({ to: v })} />
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
  const tokens: { label: string; value: number | null }[] = [
    { label: '输入', value: log.input_tokens },
    { label: '输出', value: log.output_tokens },
    { label: '总计', value: log.total_tokens },
  ];

  const failed = log.success === false;
  const tps = log.ttft_ms !== null && log.latency_ms !== null && log.latency_ms > log.ttft_ms && log.output_tokens
    ? Math.round((log.output_tokens / (log.latency_ms - log.ttft_ms)) * 1000)
    : null;

  return (
    <>
      {/* 请求 ID */}
      <div className="rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <pre className="font-mono text-sm whitespace-pre-wrap break-all">{log.request_id || '—'}</pre>
          {log.stream && <Badge variant="secondary" className="text-sm font-normal text-muted-foreground">流式</Badge>}
          {log.protocol && <Badge variant="secondary" className="text-sm font-normal text-muted-foreground">{log.protocol}</Badge>}
        </div>
      </div>
      {/* 模型与路由 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-1 text-sm text-muted-foreground"><Cpu className="h-3 w-3" />模型</div>
          <div className="mt-1 truncate font-medium">{log.model_name || '—'}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-1 text-sm text-muted-foreground"><Network className="h-3 w-3" />路由</div>
          <div className="mt-1 truncate font-medium">{log.route_group_name || 'default'}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-1 text-sm text-muted-foreground"><Brain className="h-3 w-3" />思考程度</div>
          <div className="mt-1 font-medium">{log.thinking_mode ? (log.thinking_effort ?? '—') : '—'}</div>
        </div>
      </div>
      {/* Token / 失败信息 */}
      {failed ? (
        log.error_code ? (
          <div className="rounded-lg border border-destructive p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />{log.error_code}
            </div>
            {log.error_message && <p className="mt-1 text-sm text-muted-foreground">{log.error_message}</p>}
            {(log.provider_error_code || log.provider_http_status) && (
              <p className="mt-1 text-sm text-muted-foreground">
                上游：{log.provider_error_code ?? '—'} / HTTP {log.provider_http_status ?? '—'}
              </p>
            )}
          </div>
        ) : null
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {tokens.map((t) => (
            <div key={t.label} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{t.label} Token</span>
                {t.label === '输入' && log.cache_tokens ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>输入 + 缓存</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                {t.label === '输入' && log.cache_tokens != null && log.input_tokens != null ? (
                  <>
                    <span className="text-lg font-semibold tabular-nums">{formatCompact(Math.max(0, log.input_tokens - log.cache_tokens))}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">+ {formatCompact(log.cache_tokens)}</span>
                  </>
                ) : (
                  <span className="text-lg font-semibold tabular-nums">{formatCompact(t.value)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* 耗时 */}
      {(log.latency_ms !== null || log.ttft_ms !== null) && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1 text-sm text-muted-foreground"><Activity className="h-3 w-3" />首字输出</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{log.ttft_ms !== null ? `${formatNumber(log.ttft_ms)}ms` : '—'}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1 text-sm text-muted-foreground"><Zap className="h-3 w-3" />推理速度</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{tps !== null ? formatNumber(tps) : '—'}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1 text-sm text-muted-foreground"><Clock className="h-3 w-3" />总耗时</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{log.latency_ms !== null ? `${formatNumber(log.latency_ms)}ms` : '—'}</div>
          </div>
        </div>
      )}
      {/* 计费 & 状态 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-1 text-sm text-muted-foreground"><Wallet className="h-3 w-3" />计费</div>
          <div className="mt-1 font-medium">{log.billing_plan_name ?? '—'}{log.billing_plan ? ` · ${log.billing_plan}` : ''}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-1 text-sm text-muted-foreground"><CheckCircle2 className="h-3 w-3" />状态</div>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={log.success === null ? 'pending' : log.success ? 'success' : 'failed'} map={{ pending: { variant: 'outline', label: '进行中' } }} />
            <span className="tabular-nums">{log.final_status_code ?? '—'}</span>
          </div>
        </div>
      </div>
      {/* 时间 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-1 text-sm text-muted-foreground"><Clock className="h-3 w-3" />创建时间</div>
          <div className="mt-1 font-mono text-sm">{formatDateTime(log.created_at)}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-1 text-sm text-muted-foreground"><CheckCircle2 className="h-3 w-3" />完成时间</div>
          <div className="mt-1 font-mono text-sm">{log.completed_at ? formatDateTime(log.completed_at) : '—'}</div>
        </div>
      </div>
    </>
  );
}

function AttemptsSection({ attempts }: { attempts: RequestAttemptItem[] }) {
  if (attempts.length === 0) return null;
  const labeled = withAttemptPasses(attempts);
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 text-sm text-muted-foreground">上游尝试（{labeled.length}）</div>
      <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px]">#</TableHead>
              <TableHead>供应商</TableHead>
              <TableHead>密钥</TableHead>
              <TableHead className="text-right">耗时</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {labeled.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-sm">#{a.pass}-{a.attempt_index}</TableCell>
                <TableCell className="text-sm">{a.provider_name ?? '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <span className="font-mono">{a.upstream_key_id ? `#${a.upstream_key_id.slice(-10)}` : '—'}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">{a.latency_ms !== null ? `${formatNumber(a.latency_ms)}ms` : '—'}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm" title={a.error_code ? (a.error_message ?? '') : undefined}>
                    <span className={a.error_code ? 'h-1.5 w-1.5 rounded-full bg-red-500' : 'h-1.5 w-1.5 rounded-full bg-emerald-500'} />
                    <span className="text-muted-foreground">{a.error_code ? attemptErrorLabel(a.error_code) : '成功'}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
    </div>
  );
}

export default Requests;
