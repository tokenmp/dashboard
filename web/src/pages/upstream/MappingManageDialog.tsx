import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { formatCompact } from '@/utils/format';
import {
  getModelMappingsApi, createModelMappingApi, updateModelMappingApi, deleteModelMappingApi,
  getModelKeyOptionsApi, type MappingPayload,
} from '@/api/dashboard';
import type { AiModelItem, ModelMappingItem, UpstreamKeyOption } from '@/types/upstream';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  model: AiModelItem | null;
}

export function MappingManageDialog({ open, onOpenChange, model }: Props) {
  const [mappings, setMappings] = useState<ModelMappingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ModelMappingItem | null | 'new'>(null);

  useEffect(() => {
    if (!open || !model) return;
    let active = true;
    setLoading(true);
    getModelMappingsApi(model.id)
      .then((data) => { if (active) setMappings(data); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, model]);

  if (!model) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{model.display_name || model.name} · 映射管理</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="mr-1 h-4 w-4" /> 添加映射
          </Button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : mappings.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">暂无映射</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>供应商</TableHead>
                <TableHead>上游 Key</TableHead>
                <TableHead>上游模型名</TableHead>
                <TableHead className="text-right">最大输出</TableHead>
                <TableHead className="text-right">输入价/输出价</TableHead>
                <TableHead className="text-center">状态</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {mappings.map((mm) => (
                  <TableRow key={mm.id}>
                    <TableCell className="text-xs">{mm.provider_display_name || mm.provider_name}</TableCell>
                    <TableCell className="text-xs" title={mm.upstream_key_name}>
                      <div className="max-w-[140px] truncate">{mm.upstream_key_name}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{mm.upstream_model_name || '—'}</TableCell>
                    <TableCell className="text-right text-xs">{mm.max_tokens ? formatCompact(mm.max_tokens) : '—'}</TableCell>
                    <TableCell className="text-right text-xs">
                      {fmtPrice(mm.input_price_per_token)} / {fmtPrice(mm.output_price_per_token)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={mm.status === 'active' ? 'text-green-600' : 'text-red-600'}>●</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing(mm)}>编辑</Button>
                        <Button
                          variant="ghost" size="sm" className="h-7 px-2 text-destructive"
                          onClick={async () => {
                            if (!confirm('确定删除此映射？')) return;
                            await deleteModelMappingApi(mm.id);
                            setMappings((prev) => prev.filter((x) => x.id !== mm.id));
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        {editing && (
          <MappingEditForm
            mapping={editing === 'new' ? null : editing}
            modelId={model.id}
            existingKeyIds={mappings.map((mm) => mm.upstream_key_id)}
            onClose={() => setEditing(null)}
            onSaved={(saved) => {
              setMappings((prev) => {
                const idx = prev.findIndex((x) => x.id === saved.id);
                if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
                return [...prev, saved];
              });
              setEditing(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function fmtPrice(v: number | null): string {
  if (v == null) return '—';
  return (v * 1_000_000).toFixed(4);
}

interface MappingEditFormProps {
  mapping: ModelMappingItem | null;
  modelId: string;
  existingKeyIds: string[];
  onClose: () => void;
  onSaved: (saved: ModelMappingItem) => void;
}

function MappingEditForm({ mapping, modelId, existingKeyIds, onClose, onSaved }: MappingEditFormProps) {
  const isEdit = !!mapping;
  const [keyId, setKeyId] = useState(mapping?.upstream_key_id ?? '');
  const [upstreamModelName, setUpstreamModelName] = useState(mapping?.upstream_model_name ?? '');
  const [inputPrice, setInputPrice] = useState(mapping?.input_price_per_token?.toString() ?? '');
  const [outputPrice, setOutputPrice] = useState(mapping?.output_price_per_token?.toString() ?? '');
  const [maxTokens, setMaxTokens] = useState(mapping?.max_tokens?.toString() ?? '');
  const [active, setActive] = useState(mapping?.status !== 'disabled');
  const [keyOptions, setKeyOptions] = useState<UpstreamKeyOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getModelKeyOptionsApi().then(setKeyOptions).catch(() => {});
  }, []);

  const submit = async () => {
    setError('');
    if (!keyId) { setError('必须选择上游 Key'); return; }
    const payload: MappingPayload = {
      upstream_key_id: keyId,
      upstream_model_name: upstreamModelName.trim() || null,
      input_price_per_token: inputPrice.trim() === '' ? null : Number(inputPrice),
      output_price_per_token: outputPrice.trim() === '' ? null : Number(outputPrice),
      max_tokens: maxTokens.trim() === '' ? null : Number(maxTokens),
      status: active ? 'active' : 'disabled',
      provider_endpoint_id: null,
    };
    setSaving(true);
    try {
      if (isEdit && mapping) {
        await updateModelMappingApi(mapping.id, payload);
        // 刷新该映射最新数据
        const all = await getModelMappingsApi(modelId);
        const updated = all.find((x) => x.id === mapping.id);
        if (updated) onSaved(updated);
      } else {
        await createModelMappingApi(modelId, payload);
        const all = await getModelMappingsApi(modelId);
        // 新建的没有返回完整对象，刷新全部
        onClose();
        window.dispatchEvent(new CustomEvent('mapping-refresh'));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>上游 Key *</Label>
          <SearchableSelect
            options={keyOptions.map((k) => ({
              value: k.id,
              label: k.name,
              hint: k.provider_display_name || k.provider_name,
            }))}
            value={keyId}
            onChange={setKeyId}
            placeholder="选择 Key"
            excludeValues={isEdit ? [] : existingKeyIds}
          />
        </div>
        <div className="space-y-1">
          <Label>上游模型名</Label>
          <Input value={upstreamModelName} onChange={(e) => setUpstreamModelName(e.target.value)} placeholder="如 xopglm5" />
        </div>
        <div className="space-y-1">
          <Label>输入价 / 百万 token</Label>
          <Input type="number" step="0.0001" value={inputPrice} onChange={(e) => setInputPrice(e.target.value)} placeholder="如 1.0" />
        </div>
        <div className="space-y-1">
          <Label>输出价 / 百万 token</Label>
          <Input type="number" step="0.0001" value={outputPrice} onChange={(e) => setOutputPrice(e.target.value)} placeholder="如 2.0" />
        </div>
        <div className="space-y-1">
          <Label>最大输出 (tokens)</Label>
          <Input type="number" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} placeholder="如 202752" />
        </div>
        <div className="space-y-1">
          <Label>状态</Label>
          <div className="flex items-center gap-2 pt-1">
            <Switch checked={active} onCheckedChange={setActive} />
            <span className="text-sm">{active ? 'active' : 'disabled'}</span>
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>取消</Button>
        <Button size="sm" onClick={submit} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
      </div>
    </div>
  );
}
