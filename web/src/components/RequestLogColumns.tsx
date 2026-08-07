import { useEffect, useState, type ReactNode } from 'react';
import { Columns3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell } from '@/components/ui/table';
import { MultiSelect } from '@/components/ui/multi-select';
import { ModelIcon } from '@/components/ModelIcon';
import { formatCompact, formatDateTime, formatNumber } from '@/utils/format';
import type { RequestLogItem } from '@/types/request-log';

export interface RequestLogColumn {
  key: string;
  label: string;
  headClass?: string;
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
    required: true,
    cell: (r) => (
      <TableCell className="font-mono text-sm text-muted-foreground">
        {r.request_id ? r.request_id.slice(-10) : '—'}
      </TableCell>
    ),
  },
  {
    key: 'user',
    label: '用户',
    cell: (r) => (
      <TableCell className="text-sm text-muted-foreground">
        <span className="max-w-[160px] truncate" title={r.user_email ?? ''}>{r.user_email ?? '—'}</span>
      </TableCell>
    ),
  },
  {
    key: 'apiKey',
    label: '密钥',
    cell: (r) => (
      <TableCell className="text-sm text-muted-foreground">
        <span className="max-w-[140px] truncate" title={r.api_key_name ?? ''}>{r.api_key_name ?? '—'}</span>
      </TableCell>
    ),
  },
  {
    key: 'protocol',
    label: '协议',
    headClass: 'w-[110px]',
    cell: (r) => (
      <TableCell>
        <span className="text-sm">{r.protocol ?? '—'}</span>
      </TableCell>
    ),
  },
  {
    key: 'model',
    label: '模型',
    required: true,
    cell: (r) => (
      <TableCell className="font-medium">
        <div className="flex items-center gap-1.5">
          <ModelIcon id={r.model_name ?? ''} displayName={r.model_name ?? undefined} size={20} />
          <span className="max-w-[220px] truncate">{r.model_name || '—'}</span>
        </div>
      </TableCell>
    ),
  },
  {
    key: 'type',
    label: '类型',
    headClass: 'w-[70px]',
    cell: (r) => (
      <TableCell>
        {r.stream
          ? <Badge variant="secondary" className="px-1.5 py-0 text-sm font-normal text-muted-foreground">流式</Badge>
          : <span className="text-sm text-muted-foreground">—</span>}
      </TableCell>
    ),
  },
  {
    key: 'thinking',
    label: '思考',
    headClass: 'w-[80px]',
    cell: (r) => (
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
    ),
  },
  {
    key: 'tokens',
    label: 'Token',
    headClass: 'w-[110px] text-right',
    cell: (r) => (
      <TableCell className="text-right tabular-nums">
        {r.total_tokens !== null ? formatCompact(r.total_tokens) : '—'}
      </TableCell>
    ),
  },
  {
    key: 'speed',
    label: '推理速度',
    headClass: 'w-[90px] text-right',
    cell: (r) => (
      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
        {r.ttft_ms !== null && r.latency_ms !== null && r.latency_ms > r.ttft_ms && r.output_tokens
          ? formatNumber(Math.round((r.output_tokens / (r.latency_ms - r.ttft_ms)) * 1000))
          : '—'}
      </TableCell>
    ),
  },
  {
    key: 'ttft',
    label: '首字输出',
    headClass: 'w-[90px] text-right',
    cell: (r) => (
      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
        {r.ttft_ms !== null ? `${formatNumber(r.ttft_ms)}ms` : '—'}
      </TableCell>
    ),
  },
  {
    key: 'latency',
    label: '耗时',
    headClass: 'w-[90px] text-right',
    cell: (r) => (
      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
        {r.latency_ms !== null ? `${formatNumber(r.latency_ms)}ms` : '—'}
      </TableCell>
    ),
  },
  {
    key: 'status',
    label: '状态',
    headClass: 'w-[90px]',
    required: true,
    cell: (r) => (
      <TableCell>
        <div className="flex items-center gap-1.5 text-sm" title={r.error_code ?? undefined}>
          <span className={r.success === null ? 'h-1.5 w-1.5 rounded-full bg-muted-foreground/40' : r.success ? 'h-1.5 w-1.5 rounded-full bg-emerald-500' : 'h-1.5 w-1.5 rounded-full bg-red-500'} />
          <span className="tabular-nums text-muted-foreground">{r.final_status_code ?? '—'}</span>
        </div>
      </TableCell>
    ),
  },
  {
    key: 'time',
    label: '时间',
    headClass: 'w-[160px]',
    required: true,
    cell: (r) => (
      <TableCell className="font-mono text-sm text-muted-foreground">
        {formatDateTime(r.created_at)}
      </TableCell>
    ),
  },
];

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
