import * as React from 'react';
import { cn } from '@/lib/utils';

export interface MobileCardField {
  key: string;
  label: string;
  value: React.ReactNode;
}

interface MobileCardProps {
  /** 主行标题（如模型名、密钥名），超长截断 */
  title: React.ReactNode;
  /** 主行右侧徽标（状态等） */
  badge?: React.ReactNode;
  /** 标题下的弱化行（时间 / 副标题） */
  subtitle?: React.ReactNode;
  /** label:value 字段行，两列网格排布 */
  fields?: MobileCardField[];
  /** 卡片底部操作区（按钮行等） */
  actions?: React.ReactNode;
  /** 点整卡回调（如打开详情） */
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
}

/** 移动端记录卡片：主行（标题+徽标）+ 弱化副行 + 字段两列网格 + 可选操作区。 */
export function MobileCard({ title, badge, subtitle, fields, actions, onClick, children, className }: MobileCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-3',
        onClick && 'cursor-pointer transition-colors active:bg-accent/50',
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold">{title}</span>
        {badge}
      </div>
      {subtitle && <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{subtitle}</div>}
      {fields && fields.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {fields.map((f) => (
            <div key={f.key} className="flex min-w-0 gap-1.5 text-[11px] leading-[1.45]">
              <span className="shrink-0 text-muted-foreground">{f.label}</span>
              <span className="min-w-0 truncate tabular-nums">{f.value}</span>
            </div>
          ))}
        </div>
      )}
      {children}
      {actions && <div className="mt-2">{actions}</div>}
    </div>
  );
}
