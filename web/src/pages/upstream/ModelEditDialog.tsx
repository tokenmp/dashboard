import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CAPABILITY_META } from '@/components/CapabilityBadge';
import { createModelApi, updateModelApi, type ModelPayload } from '@/api/dashboard';
import type { AiModelItem } from '@/types/upstream';

const ALL_CAPABILITIES = Object.keys(CAPABILITY_META);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 编辑时传入；新建时为 null */
  model: AiModelItem | null;
  onSaved: () => void;
}

export function ModelEditDialog({ open, onOpenChange, model, onSaved }: Props) {
  const isEdit = !!model;
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [contextWindow, setContextWindow] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [caps, setCaps] = useState<string[]>(['text']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 状态与计费模式在卡片上 toggle,编辑弹窗不再修改;此处沿用原值(新建取默认)
  const billingMode = model?.billing_mode === 'free_global' ? 'free_global' : 'billable';
  const status = model?.status === 'disabled' ? 'disabled' : 'active';

  useEffect(() => {
    if (!open) return;
    if (model) {
      setName(model.name);
      setDisplayName(model.display_name ?? '');
      setDescription(model.description ?? '');
      setContextWindow(model.context_window_tokens != null ? String(model.context_window_tokens) : '');
      setMaxTokens(model.max_tokens != null ? String(model.max_tokens) : '');
      setCaps(model.capabilities?.length ? model.capabilities : ['text']);
    } else {
      setName(''); setDisplayName(''); setDescription('');
      setContextWindow(''); setMaxTokens(''); setCaps(['text']);
    }
    setError('');
  }, [open, model]);

  const toggleCap = (c: string) => {
    setCaps((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const submit = async () => {
    setError('');
    if (!name.trim()) { setError('模型名不能为空'); return; }
    const payload: ModelPayload = {
      name: name.trim(),
      display_name: displayName.trim() || null,
      description: description.trim() || null,
      billing_mode: billingMode,
      status,
      capabilities: caps.length ? caps : ['text'],
      context_window_tokens: contextWindow.trim() === '' ? null : Number(contextWindow),
      max_tokens: maxTokens.trim() === '' ? null : Number(maxTokens),
    };
    setSaving(true);
    try {
      if (isEdit && model) await updateModelApi(model.id, payload);
      else await createModelApi(payload);
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑模型' : '新建模型'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>模型名 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 glm-5" />
          </div>
          <div className="space-y-1">
            <Label>展示名</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="如 GLM 5" />
          </div>
          <div className="space-y-1">
            <Label>描述</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>上下文与最大输出</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="number"
                value={contextWindow}
                onChange={(e) => setContextWindow(e.target.value)}
                placeholder="上下文 tokens"
              />
              <Input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                placeholder="最大输出 tokens"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>能力标签</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {ALL_CAPABILITIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCap(c)}
                  className={`rounded border px-2 py-1 text-xs ${caps.includes(c) ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                >
                  {CAPABILITY_META[c]?.label ?? c}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={submit} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
