import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  /** 指标标题 */
  label: string;
  /** 主数值 */
  value: ReactNode;
  /** 辅助说明（如环比、单位） */
  hint?: ReactNode;
  /** 右上角图标 */
  icon?: ReactNode;
  /** 数值加载中时显示骨架 */
  loading?: boolean;
  className?: string;
}

/**
 * KPI 指标卡：概览页与各列表页头部的统计卡片。
 */
export function StatCard({ label, value, hint, icon, loading, className }: StatCardProps) {
  return (
    <Card className={cn(className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          {icon && <span className="text-muted-foreground">{icon}</span>}
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">
          {loading ? <span className="inline-block h-7 w-20 animate-pulse rounded bg-muted" /> : value}
        </div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
