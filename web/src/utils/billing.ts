/**
 * 模型计费模式标签映射
 *
 * 当前 executor 仅支持 billable / free_global，但保留扩展性
 * 以便未来新增 coding / token / free 等计费模式。
 */
export interface BillingModeMeta {
  label: string;
  variant: 'default' | 'secondary';
}

export const BILLING_MODE_META: Record<string, BillingModeMeta> = {
  billable: { label: '计费', variant: 'default' },
  free_global: { label: '不计费', variant: 'secondary' },
  // 预留扩展
  coding: { label: '计费', variant: 'default' },
  token: { label: '计费', variant: 'default' },
  free: { label: '不计费', variant: 'secondary' },
};

export function billingLabel(mode: string | null | undefined): string {
  if (!mode) return '—';
  return BILLING_MODE_META[mode]?.label ?? mode;
}

export function billingVariant(mode: string | null | undefined): 'default' | 'secondary' {
  if (!mode) return 'default';
  return BILLING_MODE_META[mode]?.variant ?? 'default';
}
