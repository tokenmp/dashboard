import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props<TData> {
  column: Column<TData, unknown>;
  title: React.ReactNode;
  className?: string;
}

/** 可排序表头：点击切换升降序，带方向图标；列不可排序时仅显示标题。 */
export function DataTableColumnHeader<TData>({ column, title, className }: Props<TData>) {
  if (!column.getCanSort()) {
    return <span className={cn('text-xs font-medium text-muted-foreground', className)}>{title}</span>;
  }
  const sorted = column.getIsSorted();
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ml-3 h-8 gap-1 px-2 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground', className)}
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {title}
      {sorted === 'desc' ? <ArrowDown className="h-3 w-3" />
        : sorted === 'asc' ? <ArrowUp className="h-3 w-3" />
        : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
    </Button>
  );
}
