import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** 思考深度档位，按实际强度规范排序：none（不启用）< low < minimal < medium < high < xhigh < max */
export const ALL_EFFORTS = ['none', 'low', 'minimal', 'medium', 'high', 'xhigh', 'max'] as const;

/** 按规范强度排序已选档位 */
const sortEfforts = (efforts: string[]): string[] =>
  [...efforts].sort((a, b) => ALL_EFFORTS.indexOf(a as never) - ALL_EFFORTS.indexOf(b as never));

/** 「不指定默认档位」的哨兵值——不能用 'none',它本身是真实档位 */
const UNSET = '__unset__';

export interface ThinkingConfig {
  supported_efforts?: string[] | null;
  default_effort?: string | null;
}

interface ThinkingConfigDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 配置对象名称,用于标题 */
  targetName: string;
  /** 当前层级已配置的值(null = 未配置) */
  value: ThinkingConfig | null;
  /** 未配置时的生效配置(继承链上层),用于展示 */
  effective: ThinkingConfig | null;
  /** 生效配置来源说明,如「继承自模型」/「继承自供应商」 */
  effectiveSourceLabel?: string;
  /** 保存(config 为 null 表示清除配置、恢复继承) */
  onSave: (config: ThinkingConfig | null) => Promise<void>;
}

function describe(cfg: ThinkingConfig | null): string {
  if (!cfg || (!cfg.supported_efforts?.length && !cfg.default_effort)) return '未配置';
  const efforts = cfg.supported_efforts ?? [];
  const range = efforts.length ? `${efforts[0]}~${efforts[efforts.length - 1]}（${efforts.length} 档）` : '未限制档位';
  return `${range}${cfg.default_effort ? ` · 默认 ${cfg.default_effort}` : ''}`;
}

/** 思考深度配置弹窗：档位多选 + 默认档位；供 供应商/模型/映射 三级复用。 */
export function ThinkingConfigDialog({ open, onOpenChange, targetName, value, effective, effectiveSourceLabel, onSave }: ThinkingConfigDialogProps) {
  const [efforts, setEfforts] = useState<string[]>([]);
  const [defaultEffort, setDefaultEffort] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEfforts(value?.supported_efforts ?? []);
    setDefaultEffort(value?.default_effort ?? '');
  }, [open, value]);

  const submit = async (clear = false) => {
    setSaving(true);
    try {
      if (clear) {
        await onSave(null);
        toast.success('已清除配置，恢复继承');
      } else {
        if (defaultEffort && efforts.length && !efforts.includes(defaultEffort)) {
          toast.error('默认档位必须在所选档位内');
          return;
        }
        const sorted = sortEfforts(efforts);
        await onSave({
          supported_efforts: sorted.length ? sorted : null,
          default_effort: sorted.length && defaultEffort ? defaultEffort : null,
        });
        toast.success('思考配置已保存');
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>思考深度配置 · {targetName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!value && (
            <div className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              当前生效：{effectiveSourceLabel ?? '继承上层'} · {describe(effective)}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">支持的档位（不选 = 不限制）</label>
            <div className="flex flex-wrap gap-2 pt-1">
              {ALL_EFFORTS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEfforts((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]))}
                  className={`rounded border px-2 py-1 text-xs ${efforts.includes(e) ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">默认档位</span>
            <Select value={defaultEffort || UNSET} onValueChange={(v) => setDefaultEffort(v === UNSET ? '' : v)}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>不指定</SelectItem>
                {(efforts.length ? efforts : [...ALL_EFFORTS]).map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground">未指定/非法值将落到默认档位</span>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            {value ? (
              <Button variant="outline" size="sm" disabled={saving} onClick={() => submit(true)}>清除配置（恢复继承）</Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
              <Button size="sm" onClick={() => submit(false)} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
