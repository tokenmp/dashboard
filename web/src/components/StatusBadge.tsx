import { Badge, badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export interface StatusStyle {
  variant: BadgeVariant;
  label?: string;
  /** 自定义类名（如额外颜色） */
  className?: string;
}

export type StatusMap = Record<string, StatusStyle>;

/**
 * 跨业务的默认状态→样式映射（覆盖各模型常见 status 枚举）。
 * 各页面可传入自定义 map 覆盖或扩展。
 */
export const DEFAULT_STATUS_MAP: StatusMap = {
  // 正向 / 启用
  active: { variant: 'default', label: '启用' },
  online: { variant: 'default', label: '在线' },
  approved: { variant: 'default', label: '已通过' },
  published: { variant: 'default', label: '已发布' },
  available: { variant: 'default', label: '可用' },
  success: { variant: 'default', label: '成功' },
  completed: { variant: 'default', label: '已完成' },
  released: { variant: 'default', label: '已释放' },

  // 中性 / 次要
  disabled: { variant: 'secondary', label: '禁用' },
  expired: { variant: 'secondary', label: '已过期' },
  offline: { variant: 'secondary', label: '下线' },
  paused: { variant: 'secondary', label: '已暂停' },
  degraded: { variant: 'secondary', label: '降级' },
  exhausted: { variant: 'secondary', label: '已耗尽' },
  archived: { variant: 'secondary', label: '已归档' },
  estimated: { variant: 'secondary', label: '估算' },

  // 待处理 / 草稿
  pending: { variant: 'outline', label: '待处理' },
  draft: { variant: 'outline', label: '草稿' },
  reserved: { variant: 'outline', label: '预扣中' },
  finalized: { variant: 'outline', label: '已结算' },
  frozen: { variant: 'outline', label: '冻结' },
  info: { variant: 'outline', label: '信息' },

  // 负向 / 失败
  deleted: { variant: 'destructive', label: '已删除' },
  rejected: { variant: 'destructive', label: '已拒绝' },
  failed: { variant: 'destructive', label: '失败' },
  suspended: { variant: 'destructive', label: '已封禁' },
  disputed: { variant: 'destructive', label: '争议' },
  reversed: { variant: 'destructive', label: '已冲回' },
  urgent: { variant: 'destructive', label: '紧急' },
  warning: { variant: 'outline', label: '警告' },
};

interface StatusBadgeProps {
  status?: string | null;
  /** 自定义映射（与默认 map 合并，优先使用传入值） */
  map?: StatusMap;
  /** 直接指定展示文案，优先级高于 map */
  label?: string;
  className?: string;
}

/**
 * 状态徽章：把后端 status 字符串映射为带颜色的徽章。
 */
export function StatusBadge({ status, map, label, className }: StatusBadgeProps) {
  if (!status) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const merged: StatusMap = { ...DEFAULT_STATUS_MAP, ...(map ?? {}) };
  const style = merged[status];
  const variant = style?.variant ?? 'outline';
  const text = label ?? style?.label ?? status;
  return (
    <Badge variant={variant} className={cn(style?.className, className)}>
      {text}
    </Badge>
  );
}
