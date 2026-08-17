import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { EmptyState } from '@/components/EmptyState';
import { ProviderLogo } from '@/components/ProviderLogo';
import { toast } from 'sonner';
import {
  getDashboardProvidersApi,
  getProviderEndpointsApi,
  getModelTemplatesApi,
  createModelTemplateApi,
  updateModelTemplateApi,
  deleteModelTemplateApi,
  type ProviderModelTemplateItem,
  type TemplatePayload,
} from '@/api/dashboard';
import type { AiModelItem, ProviderEndpointItem, ProviderItem } from '@/types/upstream';

/**
 * 供应商模型模板（无 Key 映射定义）：
 * 管理端只声明「平台模型 × 供应商 × 上游模型名/端点」，不绑定上游 Key；
 * 用户「自建上游（自带 Key）」时按模板克隆映射。
 */
export function ProviderTemplatesSection({ modelId, model }: { modelId: string; model: AiModelItem | null }) {
  const [templates, setTemplates] = useState<ProviderModelTemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ProviderModelTemplateItem | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProviderModelTemplateItem | null>(null);

  const reload = useCallback(() => {
    if (!modelId) return;
    setLoading(true);
    getModelTemplatesApi(modelId).then(setTemplates).catch(() => {}).finally(() => setLoading(false));
  }, [modelId]);
  useEffect(() => { reload(); }, [reload]);

  return (
    <Card><CardContent className="p-0">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <span className="text-sm font-medium">供应商模板</span>
          <span className="ml-2 text-xs text-muted-foreground">无 Key 目录定义——管理端声明「模型 × 供应商 × 上游模型名」，用户自带 Key 激活</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditing('new')}><Plus className="mr-1 h-4 w-4" />添加模板</Button>
      </div>
      {loading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : templates.length === 0 ? (
        <EmptyState className="mx-4 my-5" title="暂无供应商模板" description="适合平台不持有 Key 的供应商：定义模板后用户可自带 Key 使用该模型" />
      ) : (
        <div className="divide-y">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-sm">
                  <ProviderLogo provider={{ id: t.provider_id, name: t.provider_name, display_name: t.provider_display_name, logo_url: t.provider_logo_url, logo_svg: t.provider_logo_svg }} size={16} />
                  <span className="truncate">{t.provider_display_name || t.provider_name}</span>
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">→ {t.upstream_model_name}</span>
                {t.endpoint_protocol
                  ? <Badge variant="secondary" className="text-[10px]">{t.endpoint_protocol}</Badge>
                  : <Badge variant="outline" className="text-[10px] text-muted-foreground">全部端点</Badge>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex items-center gap-1.5" title={t.status === 'active' ? '点击禁用该模板' : '点击启用该模板'}>
                  <Switch
                    checked={t.status === 'active'}
                    onCheckedChange={(v) => updateModelTemplateApi(t.id, { provider_id: t.provider_id, upstream_model_name: t.upstream_model_name, status: v ? 'active' : 'disabled' }).then(reload).catch((e) => toast.error(e.message))}
                  />
                  <span className={`text-[11px] ${t.status === 'active' ? 'text-emerald-600' : 'text-red-500'}`}>{t.status === 'active' ? '启用' : '禁用'}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="编辑" onClick={() => setEditing(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" title="删除" onClick={() => setPendingDelete(t)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TemplateEditDialog
        state={editing}
        model={model}
        existing={templates}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); reload(); }}
      />
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="删除供应商模板"
        description="确定删除此模板？用户自建上游将不再能选该供应商的这个模型（已创建的映射不受影响）。"
        confirmText="删除"
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteModelTemplateApi(pendingDelete.id);
            toast.success('已删除');
            setPendingDelete(null);
            reload();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : '删除失败');
          }
        }}
      />
    </CardContent></Card>
  );
}

/** 模板新建/编辑弹窗：供应商 + 上游模型名 + 端点（可选）+ 限参/定价（可选） */
function TemplateEditDialog({ state, model, existing, onClose, onSaved }: {
  state: ProviderModelTemplateItem | 'new' | null;
  model: AiModelItem | null;
  existing: ProviderModelTemplateItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = state !== null && state !== 'new' ? state : null;
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [endpoints, setEndpoints] = useState<ProviderEndpointItem[]>([]);
  const [providerId, setProviderId] = useState('');
  const [upstreamName, setUpstreamName] = useState('');
  const [endpointIds, setEndpointIds] = useState<string[]>([]);
  const [maxTokens, setMaxTokens] = useState('');
  const [contextTokens, setContextTokens] = useState('');
  const [inPrice, setInPrice] = useState('');
  const [outPrice, setOutPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboardProvidersApi({ size: 200 }).then((r) => setProviders(r.list.filter((p) => p.status === 'active'))).catch(() => {});
  }, []);
  useEffect(() => {
    if (state === null) return;
    setUpstreamName(editing ? editing.upstream_model_name : (model?.name ?? ''));
    setProviderId(editing ? editing.provider_id : '');
    setEndpointIds(editing?.provider_endpoint_id ? [editing.provider_endpoint_id] : []);
    setMaxTokens(editing?.max_tokens != null ? String(editing.max_tokens) : '');
    setContextTokens(editing?.context_window_tokens != null ? String(editing.context_window_tokens) : '');
    setInPrice(editing?.input_price_per_token != null ? String(editing.input_price_per_token) : '');
    setOutPrice(editing?.output_price_per_token != null ? String(editing.output_price_per_token) : '');
    setError('');
  }, [state]);
  useEffect(() => {
    if (!providerId) { setEndpoints([]); setEndpointIds([]); return; }
    getProviderEndpointsApi(providerId).then((list) => {
      setEndpoints(list);
      setEndpointIds((cur) => cur.filter((id) => list.some((e) => e.id === id)));
    }).catch(() => { setEndpoints([]); setEndpointIds([]); });
  }, [providerId]);

  const dup = useMemo(
    () => existing.some((t) => t.provider_id === providerId && t.id !== editing?.id && t.status !== 'deleted'),
    [existing, providerId, editing],
  );

  // 端点多选语义：不选/全选 = 全部活跃端点（按请求协议自动匹配，存 NULL）；
  // 选 1 个 = 锁定该端点；部分选择不支持（底层映射只能表达「单端点或全部」）
  const partialEndpoints = endpointIds.length > 1 && endpointIds.length < endpoints.filter((e) => e.status !== 'deleted').length;
  const resolvedEndpointId = endpointIds.length === 1 ? endpointIds[0] : null;

  const submit = async () => {
    if (!providerId) { setError('请选择供应商'); return; }
    if (!upstreamName.trim()) { setError('上游模型名必填'); return; }
    if (dup) { setError('该供应商对此模型已有模板'); return; }
    if (partialEndpoints) { setError('端点仅支持「全部（不选）」或「锁定一个」，不支持部分多选'); return; }
    const payload: TemplatePayload = {
      provider_id: providerId,
      upstream_model_name: upstreamName.trim(),
      provider_endpoint_id: resolvedEndpointId,
      max_tokens: maxTokens.trim() === '' ? null : Number(maxTokens),
      context_window_tokens: contextTokens.trim() === '' ? null : Number(contextTokens),
      input_price_per_token: inPrice.trim() === '' ? null : Number(inPrice),
      output_price_per_token: outPrice.trim() === '' ? null : Number(outPrice),
      status: 'active',
    };
    setSaving(true);
    setError('');
    try {
      if (editing) await updateModelTemplateApi(editing.id, payload);
      else await createModelTemplateApi(model?.id ?? '', payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={state !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{editing ? '编辑供应商模板' : '添加供应商模板'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>供应商 *</Label>
            <Select value={providerId} onValueChange={setProviderId} disabled={!!editing}>
              <SelectTrigger className="w-full"><SelectValue placeholder="选择供应商" /></SelectTrigger>
              <SelectContent>
                {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.display_name || p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {dup && <p className="text-xs text-destructive">该供应商已有模板</p>}
          </div>
          <div className="space-y-1">
            <Label>上游模型名 *</Label>
            <Input value={upstreamName} onChange={(e) => setUpstreamName(e.target.value)} placeholder="该供应商侧的真实模型名" className="font-mono" />
            <p className="text-xs text-muted-foreground">用户自带 Key 的请求会改写为这个名字发往上游。</p>
          </div>
          <div className="space-y-1">
            <Label>端点（可多选）</Label>
            <MultiSelect
              options={endpoints.filter((e) => e.status !== 'deleted').map((e) => ({ value: e.id, label: e.protocol, hint: e.path ?? undefined }))}
              value={endpointIds}
              onChange={setEndpointIds}
              placeholder="全部端点（按请求协议自动匹配）"
            />
            <p className={`text-xs ${partialEndpoints ? 'text-destructive' : 'text-muted-foreground'}`}>
              {partialEndpoints
                ? '仅支持「全部（不选）」或「锁定一个」端点'
                : '不选 = 全部端点（Chat/Messages 请求按协议自动匹配）；选 1 个 = 锁定该端点'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>最大输出 tokens</Label>
              <Input value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} placeholder="可选" inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <Label>上下文窗口</Label>
              <Input value={contextTokens} onChange={(e) => setContextTokens(e.target.value)} placeholder="可选" inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <Label>输入价 / token</Label>
              <Input value={inPrice} onChange={(e) => setInPrice(e.target.value)} placeholder="可选" inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label>输出价 / token</Label>
              <Input value={outPrice} onChange={(e) => setOutPrice(e.target.value)} placeholder="可选" inputMode="decimal" />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={submit} disabled={saving || dup || partialEndpoints}>{saving ? '保存中…' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
