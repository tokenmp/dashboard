import { Coins } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ToggleIconButtonProps {
  icon: ReactNode;
  /** 悬停立即显示的提示（替代原生 title 的长延迟） */
  tip: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

/** 带即时 tooltip 的紧凑图标操作按钮（行内启/禁等切换用）。 */
export function ToggleIconButton({ icon, tip, onClick, disabled, className }: ToggleIconButtonProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${className ?? ''}`}
            disabled={disabled}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** 带斜杠的硬币图标：free_global（不计费）时叠加斜线，计费时为普通硬币。 */
export function CoinIcon({ slashed }: { slashed: boolean }) {
  return (
    <span className="relative inline-flex items-center justify-center">
      <Coins className="h-4 w-4" />
      {slashed && (
        <span className="absolute left-1/2 top-1/2 h-[1.5px] w-[18px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded bg-current" />
      )}
    </span>
  );
}
