import { useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { getDashboardRequestsApi } from '@/api/dashboard';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useUrlQueryState } from '@/hooks/useUrlQueryState';
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
  SelectValue,
} from '@/components/ui/select';
import { ModelIcon } from '@/components/ModelIcon';
import { UserSearchSelect } from '@/components/UserSearchSelect';
import {
  MobileCard,
  FilterChip,
  FilterChipRow,
  MobileFilterSheet,
  MobileFilterField,
  MobilePagination,
  MobilePageHeader,
} from '@/components/mobile';
import type { MobileCardField } from '@/components/mobile';
import { formatCompact, formatDateTime, formatNumber } from '@/utils/format';
import { attemptErrorLabel } from '@/utils/attempts';
import { DetailDrawer, PROTOCOLS } from './index';
import type { RequestLogQuery, RequestLogItem } from '@/types/request-log';

/** 状态筛选项（与桌面 FiltersBar 一致） */
const SUCCESS_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: '1', label: '成功' },
  { value: '0', label: '失败' },
];

/**
 * 管理端·请求日志（移动视图）：搜索框 + 筛选 chips + 卡片流 + 紧凑分页。
 * 数据 hooks、筛选状态模型与桌面视图完全一致（同一组 URL query 字段），
 * 详情复用 index.tsx 导出的 DetailDrawer（移动端底部滑出）。
 */
export function RequestsAdminMobile() {
  const [detailId, setDetailId] = useState<string | null>(null);

  const { initial: urlInit, write } = useUrlQueryState([
    { name: 'q', key: 'keyword' },
    { name: 'protocol', key: 'protocol' },
    { name: 'success', key: 'success' },
    { name: 'user', key: 'userId' },
    { name: 'page', key: 'page', type: 'number', default: 1 },
    { name: 'size', key: 'size', type: 'number', default: 20 },
  ]);
  const { list, total, page, size, loading, error, params, reload, setPage, setFilters } =
    usePagedQuery(getDashboardRequestsApi, {
      initial: { size: 20, sort: '-created_at', ...urlInit } as RequestLogQuery,
    });
  useEffect(() => { write(params); }, [params]);

  /** 激活筛选字段数（筛选入口角标）；关键字有独立搜索框，不计入 */
  const activeCount = [params.protocol, params.success, params.userId]
    .filter((v) => v !== undefined && v !== null && v !== '')
    .length;

  return (
    <div className="space-y-3">
      {/* 页头 */}
      <MobilePageHeader
        title="请求日志"
        action={
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        }
      />

      {/* 搜索 + 全量筛选入口 */}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <DebouncedInput
            className="pl-8"
            placeholder="搜索 request_id / trace_id / 模型名"
            value={params.keyword ?? ''}
            onDebouncedChange={(v) => setFilters({ keyword: v })}
          />
        </div>
        <MobileFilterSheet
          activeCount={activeCount}
          onReset={() => setFilters({ keyword: '', protocol: '', success: '', userId: '' })}
        >
          <MobileFilterField label="用户">
            <UserSearchSelect
              value={params.userId ?? ''}
              onChange={(v) => setFilters({ userId: v })}
            />
          </MobileFilterField>
          <MobileFilterField label="协议">
            <Select value={params.protocol ?? 'all'} onValueChange={(v) => setFilters({ protocol: v === 'all' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {PROTOCOLS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </MobileFilterField>
          <MobileFilterField label="状态">
            <Select value={params.success ?? 'all'} onValueChange={(v) => setFilters({ success: v === 'all' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="1">成功</SelectItem>
                <SelectItem value="0">失败</SelectItem>
              </SelectContent>
            </Select>
          </MobileFilterField>
        </MobileFilterSheet>
      </div>

      {/* 高频筛选 chips：状态 / 协议（用户筛选需搜索选择器，收在筛选 Sheet 内） */}
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
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* 卡片流 */}
      {loading && list.length === 0 ? (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="暂无请求日志" description="尝试调整筛选条件或刷新" />
      ) : (
        <div className="space-y-2.5">
          {list.map((r) => (
            <AdminRequestCard key={r.id} log={r} onClick={() => setDetailId(r.id)} />
          ))}
        </div>
      )}

      {/* 分页 */}
      {total > 0 && <MobilePagination page={page} size={size} total={total} onPageChange={setPage} />}

      {/* 详情抽屉（与桌面共用同一 DetailDrawer） */}
      <DetailDrawer id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

/* ----------------------------- 请求卡片 ----------------------------- */

/** 单条请求的移动卡片：标题=模型、徽标=状态、副行=时间+用户邮箱（admin 特有）+密钥名，字段取自页面真实列。 */
function AdminRequestCard({ log, onClick }: { log: RequestLogItem; onClick: () => void }) {
  // 字段与桌面列同源：Token 入/出、状态码、供应商、协议、耗时、计费套餐；失败请求追加错误
  const fields: MobileCardField[] = [
    { key: 'tokens', label: 'Token 入/出', value: `${log.input_tokens !== null ? formatCompact(log.input_tokens) : '—'} / ${log.output_tokens !== null ? formatCompact(log.output_tokens) : '—'}` },
    { key: 'status', label: '状态码', value: log.final_status_code ?? '—' },
    { key: 'provider', label: '供应商', value: log.requested_provider_name ?? '—' },
    { key: 'protocol', label: '协议', value: log.protocol ?? '—' },
    { key: 'latency', label: '耗时', value: log.latency_ms !== null ? `${formatNumber(log.latency_ms)}ms` : '—' },
    { key: 'billing', label: '计费', value: log.billing_plan_name ?? '—' },
  ];
  if (log.success === false && log.error_code) {
    fields.push({ key: 'error', label: '错误', value: <span className="text-destructive">{attemptErrorLabel(log.error_code) ?? log.error_code}</span> });
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
          {log.user_email ? ` · ${log.user_email}` : ''}
          {log.api_key_name ? ` · ${log.api_key_name}` : ''}
        </>
      }
      fields={fields}
      onClick={onClick}
    />
  );
}
