import * as React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface FilterChipOption {
  value: string;
  label: string;
}

interface FilterChipProps {
  /** 展示前缀，如「状态」「时间」 */
  label: string;
  options: FilterChipOption[];
  /** 当前值；空串 / 等于 allValue 时视为未筛选（chip 灰态） */
  value?: string;
  onChange: (value: string) => void;
  /** 「全部」对应的值，默认 'all' */
  allValue?: string;
}

/** 筛选 chip：chip 形态的单选下拉，点开即选即生效。用于高频筛选项的常驻快捷入口。 */
export function FilterChip({ label, options, value, onChange, allValue = 'all' }: FilterChipProps) {
  const current = value && value !== '' ? value : allValue;
  const active = !!value && value !== '' && value !== allValue;
  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          'h-[26px] w-auto gap-1 rounded-full border bg-muted px-2.5 text-[11.5px] font-normal shadow-none',
          '[&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-60 data-[placeholder]:text-foreground',
          active && 'border-primary bg-primary text-primary-foreground data-[placeholder]:text-primary-foreground',
        )}
      >
        <span className={cn('shrink-0', active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** chips 横向滚动容器（隐藏滚动条）。 */
export function FilterChipRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface MobileFilterSheetProps {
  /** 当前激活的筛选字段数（显示为角标；0 时不显示） */
  activeCount: number;
  /** 重置全部筛选 */
  onReset: () => void;
  children: React.ReactNode;
}

/**
 * 移动端全量筛选：入口按钮（角标计数）+ 底部 Sheet 表单。
 * 筛选即时生效（与桌面一致），「应用」仅关闭面板，「重置」清空全部。
 * 字段用 <MobileFilterField label="...">control</MobileFilterField> 包裹。
 */
export function MobileFilterSheet({ activeCount, onReset, children }: MobileFilterSheetProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant="outline"
        className="h-8 shrink-0 gap-1 rounded-lg px-2.5 text-[11.5px]"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        筛选
        {activeCount > 0 && (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
            {activeCount}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="flex max-h-[76dvh] flex-col rounded-t-2xl p-0 pb-safe">
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border" />
          <SheetHeader className="px-5 pt-3 text-left">
            <SheetTitle className="text-base">筛选</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">{children}</div>
          <div className="flex gap-2.5 border-t px-5 py-3.5 pb-safe">
            <Button variant="outline" className="h-10 flex-1" onClick={onReset}>
              重置
            </Button>
            <Button className="h-10 flex-1" onClick={() => setOpen(false)}>
              应用
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** 筛选 Sheet 内的单个字段：弱化 label + 控件。 */
export function MobileFilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3.5 first:mt-1">
      <div className="mb-1.5 text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
