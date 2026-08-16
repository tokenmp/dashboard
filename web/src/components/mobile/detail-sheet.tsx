import * as React from 'react';
import { SheetContent } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { cn } from '@/lib/utils';

type DetailSheetContentProps = React.ComponentPropsWithoutRef<typeof SheetContent>;

/**
 * 详情抽屉：移动端从底部滑出（圆角顶 + 拖动条 + 高度 88dvh + 内部滚动），
 * 桌面端维持现状（右侧抽屉 w-full sm:max-w-2xl）。
 * 用法与 SheetContent 相同，是它的响应式替身；内部内容无需感知移动/桌面。
 */
export const DetailSheetContent = React.forwardRef<
  React.ElementRef<typeof SheetContent>,
  DetailSheetContentProps
>(({ className, children, ...props }, ref) => {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return (
      <SheetContent ref={ref} side="right" className={cn('w-full overflow-y-auto sm:max-w-2xl', className)} {...props}>
        {children}
      </SheetContent>
    );
  }

  return (
    <SheetContent
      ref={ref}
      side="bottom"
      className={cn('flex h-[88dvh] flex-col rounded-t-2xl p-0 pb-safe', className)}
      {...props}
    >
      <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border" />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-3">{children}</div>
    </SheetContent>
  );
});

DetailSheetContent.displayName = 'DetailSheetContent';
