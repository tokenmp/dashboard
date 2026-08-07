import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { createUpstreamKeyApi, getDashboardProvidersApi } from '@/api/dashboard';
import { useAsync } from '@/hooks/useAsync';
import type { ProviderItem } from '@/types/upstream';

const QUOTA_TYPES = ['token_plan', 'coding_plan'];

export function CreateKeyDialog({
  open,
  onOpenChange,
  providerId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string | null;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [keyVal, setKeyVal] = useState('');
  const [quotaType, setQuotaType] = useState('token_plan');
  const [maxConcurrency, setMaxConcurrency] = useState('10');
  const [priority, setPriority] = useState('0');
  const [expiresAt, setExpiresAt] = useState('');
  const [selectedProvider, setSelectedProvider] = useState(providerId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // standalone 模式（无 providerId）拉取供应商列表供选择
  const { data: providersData } = useAsync(
    () => (providerId ? Promise.resolve(null) : getDashboardProvidersApi({ size: 200 })),
    [],
  );
  const providerOptions = (providersData?.list ?? []).map((p: ProviderItem) => ({
    value: p.id,
    label: p.display_name || p.name,
    hint: p.name,
  }));

  useEffect(() => { setSelectedProvider(providerId ?? ''); }, [providerId, open]);

  const reset = () => { setName(''); setKeyVal(''); setQuotaType('token_plan'); setMaxConcurrency('10'); setPriority('0'); setExpiresAt(''); setError(''); };

  const effectiveProviderId = providerId ?? selectedProvider;
  const submit = async () => {
    if (!effectiveProviderId) { setError('请选择供应商'); return; }
    if (!name.trim() || !keyVal.trim()) { setError('名称与密钥必填'); return; }
    setSaving(true); setError('');
    try {
      await createUpstreamKeyApi(effectiveProviderId, {
        name: name.trim(),
        key: keyVal.trim(),
        quota_type: quotaType,
        max_concurrency: Number(maxConcurrency) || 10,
        priority: Number(priority) || 0,
        expires_at: expiresAt || undefined,
      });
      reset();
      onCreated();
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>新建上游账号</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>名称 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 astron-main" />
          </div>
          <div className="space-y-1">
            <Label>密钥 *</Label>
            <Input type="password" value={keyVal} onChange={(e) => setKeyVal(e.target.value)} placeholder="上游 API Key 明文" />
          </div>
          {!providerId && (
            <div className="space-y-1">
              <Label>供应商 *</Label>
              <SearchableSelect
                options={providerOptions}
                value={selectedProvider}
                onChange={setSelectedProvider}
                placeholder="选择供应商"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>配额类型</Label>
              <Select value={quotaType} onValueChange={setQuotaType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUOTA_TYPES.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>并发上限</Label>
              <Input type="number" value={maxConcurrency} onChange={(e) => setMaxConcurrency(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>优先级</Label>
              <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>到期（可选）</Label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
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
