import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** 标题，默认「暂无数据」 */
  title?: string;
  description?: string;
  /** 右侧操作区（如新建按钮） */
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/**
 * 空数据占位：列表为空、无搜索结果等场景。
 */
export function EmptyState({
  title = '暂无数据',
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center ${className ?? ''}`}
    >
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
