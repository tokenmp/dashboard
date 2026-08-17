import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateDashboardProviderApi } from '@/api/dashboard';
import type { ProviderItem } from '@/types/upstream';

/** 编辑供应商基础信息（名称 / 展示名 / base_url），Logo 与思考配置走各自入口 */
export function ProviderEditDialog({
  provider,
  onClose,
  onSaved,
}: {
  provider: ProviderItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const open = provider !== null;

  useEffect(() => {
    if (open && provider) {
      setName(provider.name ?? '');
      setDisplayName(provider.display_name ?? '');
      setBaseUrl(provider.base_url ?? '');
      setError('');
    }
  }, [open, provider]);

  const submit = async () => {
    if (!provider) return;
    if (!name.trim()) { setError('名称必填'); return; }
    setSaving(true);
    setError('');
    try {
      await updateDashboardProviderApi(provider.id, {
        name: name.trim(),
        display_name: displayName.trim() || null,
        base_url: baseUrl.trim(),
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>编辑供应商</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>名称 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 astron" />
          </div>
          <div className="space-y-1">
            <Label>展示名</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="如 星辰智能" />
          </div>
          <div className="space-y-1">
            <Label>base_url</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" className="font-mono" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={submit} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
