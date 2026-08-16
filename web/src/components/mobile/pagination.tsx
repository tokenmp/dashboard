import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MobilePaginationProps {
  page: number;
  size: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** 移动端紧凑分页：上一页 / 第 N 页 · 共 M 条 / 下一页。 */
export function MobilePagination({ page, size, total, onPageChange }: MobilePaginationProps) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-0.5 px-2 text-[11px]"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="h-3 w-3" />
        上一页
      </Button>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        第 {page} / {pages} 页 · 共 {total} 条
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-0.5 px-2 text-[11px]"
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
      >
        下一页
        <ChevronRight className="h-3 w-3" />
      </Button>
    </div>
  );
}
