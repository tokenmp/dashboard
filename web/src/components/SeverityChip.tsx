import { cn } from '@/lib/utils';

const SEVERITY_STYLE: Record<string, { label: string; cls: string }> = {
  info: { label: '信息', cls: 'bg-sky-100 text-sky-700' },
  warning: { label: '警告', cls: 'bg-amber-100 text-amber-800' },
  urgent: { label: '紧急', cls: 'bg-red-100 text-red-700' },
};

/** 严重级别彩色块：信息(天蓝)/警告(琥珀)/紧急(红)，置于标题前作为主视觉。 */
export function SeverityChip({ severity, className }: { severity: string; className?: string }) {
  const s = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.info;
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium', s.cls, className)}>
      {s.label}
    </span>
  );
}
