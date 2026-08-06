import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export interface ComboOption {
  value: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

interface Props {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 已选中的 option 不显示在列表中（避免重复绑定） */
  excludeValues?: string[];
  disabled?: boolean;
}

/**
 * 轻量可搜索下拉选择器
 * - 不用 Portal，用绝对定位 dropdown，避免 Dialog 内 z-index 冲突
 * - 支持搜索过滤（label + hint）
 */
export function SearchableSelect({ options, value, onChange, placeholder, excludeValues = [], disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const excludeSet = new Set(excludeValues);
  const filtered = options.filter((o) => {
    if (excludeSet.has(o.value) && o.value !== value) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return o.label.toLowerCase().includes(q) || (o.hint?.toLowerCase().includes(q) ?? false);
  });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen((v) => !v); setQuery(''); }}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selected ? '' : 'text-muted-foreground'}>
          {selected ? (
            <span className="flex items-center gap-1">
              <span>{selected.label}</span>
            </span>
          ) : (placeholder ?? '请选择')}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <div className="absolute z-[100] mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="border-b p-1">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索…"
                className="h-8 border-0 pl-7 shadow-none focus-visible:ring-0"
              />
            </div>
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="py-3 text-center text-xs text-muted-foreground">无匹配项</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${o.value === value ? 'bg-accent' : ''}`}
                >
                  <span className="flex items-center gap-2">
                    {o.icon}
                    <span className="flex flex-col items-start">
                      <span className="truncate">{o.label}</span>
                      {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
