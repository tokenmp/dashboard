import { Brain, Eye, FileText, Maximize2, type LucideIcon } from 'lucide-react';

export interface CapabilityMeta {
  icon: LucideIcon;
  label: string;
}

export const CAPABILITY_META: Record<string, CapabilityMeta> = {
  text: { icon: FileText, label: '文本' },
  thinking: { icon: Brain, label: '思考' },
  vision: { icon: Eye, label: '视觉' },
  long_context: { icon: Maximize2, label: '长上下文' },
};

export function CapabilityBadge({ capability }: { capability: string }) {
  const meta = CAPABILITY_META[capability];
  const Icon = meta?.icon;
  const label = meta?.label ?? capability;
  return (
    <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </span>
  );
}
