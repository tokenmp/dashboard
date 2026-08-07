import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface MultiOption {
  value: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  /** 禁用项：不可勾选/取消（用于必须列） */
  disabled?: boolean;
}

interface Props {
  options: MultiOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** 自定义触发器（如图标按钮）；不传则用默认输入框样式 */
  trigger?: ReactNode;
  /** 展示风格：tag=标签徽章（默认），header=表头勾选（左侧方框） */
  variant?: 'tag' | 'header';
  /** 下拉对齐：start=左对齐（默认），end=右对齐（trigger 在右侧时用，避免溢出触发滚动） */
  align?: 'start' | 'end';
}

/**
 * 轻量多选下拉（不用 Portal，绝对定位 dropdown，适配 Dialog 内使用）。
 * trigger 用 badge 展示已选项，下拉项点击切换选中（不关闭）。
 */
export function MultiSelect({ options, value, onChange, placeholder, disabled, trigger, variant = 'tag', align = 'start' }: Props) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedSet = new Set(value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropUp(spaceBelow < 240 && rect.top > spaceBelow);
  }, [open]);

  const selectedLabels = options.filter((o) => selectedSet.has(o.value));
  const toggle = (v: string) => {
    if (options.find((o) => o.value === v)?.disabled) return;
    onChange(selectedSet.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <div className="relative" ref={ref}>
      {trigger ? (
        <div onClick={() => !disabled && setOpen((v) => !v)}>{trigger}</div>
      ) : (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1.5 text-left text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex flex-1 flex-wrap items-center gap-1">
          {selectedLabels.length === 0 ? (
            <span className="text-muted-foreground">{placeholder ?? '请选择'}</span>
          ) : (
            selectedLabels.map((o) => (
              <Badge key={o.value} variant="secondary" className="text-[10px]">{o.label}</Badge>
            ))
          )}
        </span>
        {dropUp ? <ChevronUp className="h-4 w-4 shrink-0 opacity-50" /> : <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />}
      </button>
      )}
      {open && (
        <div className={`absolute z-[100] min-w-[200px] w-full rounded-md border bg-popover shadow-md ${align === 'end' ? 'right-0' : 'left-0'} ${dropUp ? 'bottom-full mb-1' : 'mt-1'}`}>
          <div className="max-h-[60vh] overflow-y-auto p-1">
            {options.length === 0 ? (
              <div className="py-3 text-center text-xs text-muted-foreground">无选项</div>
            ) : (
              options.map((o) => {
                const checked = selectedSet.has(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={o.disabled}
                    onClick={() => toggle(o.value)}
                    className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm ${o.disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-accent'} ${checked ? 'bg-accent' : ''}`}
                  >
                    {variant === 'header' && (
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-transparent'}`}>
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                    )}
                    <span className="flex flex-1 items-center gap-2">
                      {o.icon}
                      <span className="flex flex-col items-start">
                        <span className="truncate">{o.label}</span>
                        {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
                      </span>
                    </span>
                    {variant === 'tag' && checked && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
