import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createDashboardProviderApi } from '@/api/dashboard';

export function ProviderCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) { setError('名称必填'); return; }
    setSaving(true);
    setError('');
    try {
      await createDashboardProviderApi({
        name: name.trim(),
        display_name: displayName.trim() || null,
        base_url: baseUrl.trim(),
      });
      setName(''); setDisplayName(''); setBaseUrl('');
      onCreated();
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>新增供应商</DialogTitle></DialogHeader>
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
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={submit} disabled={saving}>{saving ? '保存中…' : '创建'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
