import { useEffect, useState, type ReactNode } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Columns3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MultiSelect } from '@/components/ui/multi-select';
import { ModelIcon } from '@/components/ModelIcon';
import { formatCompact, formatDateTime, formatNumber } from '@/utils/format';
import type { RequestLogItem } from '@/types/request-log';

export interface RequestLogColumn {
  key: string;
  label: string;
  headClass?: string;
  /** 单元格 className（原 TableCell 的 className） */
  cellClass?: string;
  /** 单元格内容（不含 TableCell 包裹，由 DataTable 渲染） */
  cell: (r: RequestLogItem) => ReactNode;
  /** 必须列：始终可见且不可在列选择中取消 */
  required?: boolean;
}

/** 请求日志列表的全部列配置（顺序即展示顺序）。 */
export const REQUEST_LOG_COLUMNS: RequestLogColumn[] = [
  {
    key: 'id',
    label: 'ID',
    headClass: 'w-[140px]',
    cellClass: 'font-mono text-sm text-muted-foreground',
    required: true,
    cell: (r) => r.request_id ? r.request_id.slice(-10) : '—',
  },
  {
    key: 'user',
    label: '用户',
    cellClass: 'text-sm text-muted-foreground',
    cell: (r) => <span className="block max-w-[160px] truncate" title={r.user_email ?? ''}>{r.user_email ?? '—'}</span>,
  },
  {
    key: 'apiKey',
    label: '密钥',
    cellClass: 'text-sm text-muted-foreground',
    cell: (r) => <span className="block max-w-[140px] truncate" title={r.api_key_name ?? ''}>{r.api_key_name ?? '—'}</span>,
  },
  {
    key: 'protocol',
    label: '协议',
    headClass: 'w-[110px]',
    cell: (r) => <span className="text-sm">{r.protocol ?? '—'}</span>,
  },
  {
    key: 'model',
    label: '模型',
    required: true,
    cellClass: 'font-medium',
    cell: (r) => (
      <div className="flex items-center gap-1.5">
        <ModelIcon id={r.model_name ?? ''} displayName={r.model_name ?? undefined} size={20} />
        <span className="max-w-[220px] truncate">{r.model_name || '—'}</span>
      </div>
    ),
  },
  {
    key: 'type',
    label: '类型',
    headClass: 'w-[70px]',
    cell: (r) => r.stream
      ? <Badge variant="secondary" className="px-1.5 py-0 text-sm font-normal text-muted-foreground">流式</Badge>
      : <span className="text-sm text-muted-foreground">—</span>,
  },
  {
    key: 'thinking',
    label: '思考',
    headClass: 'w-[80px]',
    cellClass: 'text-sm',
    cell: (r) => r.thinking_mode ? (
      <span className="inline-flex items-center gap-1">
        <span>{r.thinking_effort ?? '—'}</span>
        {r.thinking_effort_degraded && <Badge variant="outline" className="px-1 py-0 text-sm text-amber-600">降级</Badge>}
      </span>
    ) : <span className="text-muted-foreground">—</span>,
  },
  {
    key: 'tokens',
    label: 'Token',
    headClass: 'w-[110px] text-right',
    cellClass: 'text-right tabular-nums',
    cell: (r) => r.total_tokens !== null ? formatCompact(r.total_tokens) : '—',
  },
  {
    key: 'speed',
    label: '推理速度',
    headClass: 'w-[90px] text-right',
    cellClass: 'text-right tabular-nums text-sm text-muted-foreground',
    cell: (r) => r.stream && r.ttft_ms && r.latency_ms !== null && r.latency_ms > r.ttft_ms && r.output_tokens
      ? formatNumber(Math.round((r.output_tokens / (r.latency_ms - r.ttft_ms)) * 1000))
      : '—',
  },
  {
    key: 'ttft',
    label: '首字输出',
    headClass: 'w-[90px] text-right',
    cellClass: 'text-right tabular-nums text-sm text-muted-foreground',
    // 非流式没有首 token 概念；流式但值为 0/null（首包前失败/存量 0）同样视为无值
    cell: (r) => (r.stream && r.ttft_ms ? `${formatNumber(r.ttft_ms)}ms` : '—'),
  },
  {
    key: 'latency',
    label: '耗时',
    headClass: 'w-[90px] text-right',
    cellClass: 'text-right tabular-nums text-sm text-muted-foreground',
    cell: (r) => r.latency_ms !== null ? `${formatNumber(r.latency_ms)}ms` : '—',
  },
  {
    key: 'status',
    label: '状态',
    headClass: 'w-[90px]',
    required: true,
    cell: (r) => (
      <div className="flex items-center gap-1.5 text-sm" title={r.error_code ?? undefined}>
        <span className={r.success === null ? 'h-1.5 w-1.5 rounded-full bg-muted-foreground/40' : r.success ? 'h-1.5 w-1.5 rounded-full bg-emerald-500' : 'h-1.5 w-1.5 rounded-full bg-red-500'} />
        <span className="tabular-nums text-muted-foreground">{r.final_status_code ?? '—'}</span>
      </div>
    ),
  },
  {
    key: 'time',
    label: '时间',
    headClass: 'w-[160px]',
    required: true,
    cellClass: 'font-mono text-sm text-muted-foreground',
    cell: (r) => formatDateTime(r.created_at),
  },
];

/** 把 RequestLogColumn[] 转成 DataTable 的 ColumnDef[]（cell 内容 + meta.className 合并 headClass/cellClass）。 */
export function buildRequestColumns(cols: RequestLogColumn[]): ColumnDef<RequestLogItem>[] {
  return cols.map((c) => ({
    id: c.key,
    meta: { className: [c.headClass, c.cellClass].filter(Boolean).join(' ') },
    header: () => <span className="text-xs font-medium text-muted-foreground">{c.label}</span>,
    cell: ({ row }) => c.cell(row.original),
  }));
}

/** 列可见性状态，持久化到 localStorage。默认全部可见。 */
export function useColumnVisibility(storageKey: string, allKeys: string[], requiredKeys: string[] = []) {
  const merge = (keys: string[]) => Array.from(new Set([...keys.filter((k) => allKeys.includes(k)), ...requiredKeys]));
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        const valid = allKeys.filter((k) => parsed.includes(k));
        if (valid.length) return merge(valid);
      }
    } catch {
      /* ignore */
    }
    return merge(allKeys);
  });
  const setVisible = (keys: string[]) => setVisibleKeys(merge(keys));
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(visibleKeys));
    } catch {
      /* ignore */
    }
  }, [visibleKeys, storageKey]);
  return [visibleKeys, setVisible] as const;
}

/** 列选择下拉（多选），用于筛选区。 */
export function ColumnToggle({
  columns,
  visibleKeys,
  onChange,
}: {
  columns: RequestLogColumn[];
  visibleKeys: string[];
  onChange: (keys: string[]) => void;
}) {
  return (
    <MultiSelect
      options={columns.map((c) => ({ value: c.key, label: c.label, disabled: c.required }))}
      value={visibleKeys}
      onChange={onChange}
      variant="header"
      align="end"
      trigger={
        <Button variant="ghost" size="icon" className="h-7 w-7" title="选择显示的列">
          <Columns3 className="h-4 w-4" />
        </Button>
      }
    />
  );
}
