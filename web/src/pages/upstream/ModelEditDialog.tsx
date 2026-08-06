import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
  const [billingMode, setBillingMode] = useState<'billable' | 'free_global'>('billable');
  const [contextWindow, setContextWindow] = useState('');
  const [caps, setCaps] = useState<string[]>(['text']);
  const [status, setStatus] = useState<'active' | 'disabled'>('active');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (model) {
      setName(model.name);
      setDisplayName(model.display_name ?? '');
      setDescription(model.description ?? '');
      setBillingMode(model.billing_mode === 'free_global' ? 'free_global' : 'billable');
      setContextWindow(model.context_window_tokens != null ? String(model.context_window_tokens) : '');
      setCaps(model.capabilities?.length ? model.capabilities : ['text']);
      setStatus(model.status === 'disabled' ? 'disabled' : 'active');
    } else {
      setName(''); setDisplayName(''); setDescription('');
      setBillingMode('billable'); setContextWindow(''); setCaps(['text']); setStatus('active');
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>计费模式</Label>
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  checked={billingMode === 'free_global'}
                  onCheckedChange={(v) => setBillingMode(v ? 'free_global' : 'billable')}
                />
                <span className="text-sm">{billingMode === 'free_global' ? '不计费' : '计费'}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>上下文窗口 (tokens)</Label>
              <Input
                type="number"
                value={contextWindow}
                onChange={(e) => setContextWindow(e.target.value)}
                placeholder="如 128000"
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
          {isEdit && (
            <div className="space-y-1">
              <Label>状态</Label>
              <div className="flex items-center gap-2 pt-1">
                <Switch checked={status === 'disabled'} onCheckedChange={(v) => setStatus(v ? 'disabled' : 'active')} />
                <span className="text-sm">{status === 'disabled' ? '已禁用' : '正常'}</span>
              </div>
            </div>
          )}
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
