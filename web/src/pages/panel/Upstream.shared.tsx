import { useEffect, useState } from 'react';
import {
  PlugZap, KeyRound, TriangleAlert, CheckCircle2, XCircle,
} from 'lucide-react';
import {
  getPanelUpstreamKeyDetailApi,
  getPanelUpstreamCreateOptionsApi,
  createPanelUpstreamKeyApi,
  updatePanelUpstreamKeyApi,
  probePanelUpstreamKeyApi,
  addPanelUpstreamKeyModelsApi,
  removePanelUpstreamKeyModelApi,
  updatePanelUpstreamKeyModelApi,
} from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { useMutation } from '@/hooks/useMutation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatDateTime } from '@/utils/format';
import { useIsMobile } from '@/hooks/use-is-mobile';
import type { UpstreamKeyItem, UpstreamProviderOption, UpstreamModelOption, UpstreamProbeResult } from '@/types/upstream';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

/** 「我的上游」桌面/移动共享件：计费徽标、探测单元格与三个对话框。 */

/**
 * 模型多选 + 行内「转发到上游模型名」编辑：
 * 下拉每项右侧输入框直接改转发名（placeholder=平台模板值，留空即用默认）；
 * 选中标签显示 `平台模型名（转发名）`，实时反映当前生效值。
 */
export function UpstreamModelSelect({ models, selectedIds, onChange, names, onNamesChange, placeholder, disabled }: {
  models: UpstreamModelOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  names: Record<string, string>;
  onNamesChange: (next: Record<string, string>) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const modelOf = (id: string) => models.find((m) => m.id === id);
  const defaultName = (id: string) => {
    const m = modelOf(id);
    return m ? (m.upstream_model_name || m.name) : '';
  };
  const effectiveName = (id: string) => (names[id] ?? '').trim() || defaultName(id);
  return (
    <div className="space-y-1">
      <MultiSelect
        options={models.map((m) => ({ value: m.id, label: m.display_name || m.name, hint: m.name }))}
        value={selectedIds}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        nameEditable
        names={names}
        namePlaceholderOf={defaultName}
        onNameChange={(v, n) => onNamesChange({ ...names, [v]: n })}
        tagLabelOf={(v) => {
          const m = modelOf(v);
          if (!m) return '';
          return `${m.display_name || m.name}（${effectiveName(v)}）`;
        }}
      />
      {selectedIds.length > 0 && (
        <p className="text-xs text-muted-foreground">括号内为转发到上游的模型名；在下拉框右侧输入框修改，留空用平台默认。</p>
      )}
    </div>
  );
}

/** 计费模式徽标：free = 免扣套餐（走自有 key 不耗额度） */
export function BillingModeBadge({ mode }: { mode: string }) {
  return mode === 'free' ? (
    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">免扣</Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">照常扣</Badge>
  );
}

/** 探测状态单元格：最近 verified_at + 成败图标（悬停看错误） */
export function VerifiedCell({ row }: { row: UpstreamKeyItem }) {
  if (!row.verified_at) return <span className="text-xs text-muted-foreground">未探测</span>;
  const ok = !row.last_validation_error;
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-xs ${ok ? 'text-emerald-600' : 'text-destructive'}`} title={row.last_validation_error ?? undefined}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {formatDateTime(row.verified_at)}
    </span>
  );
}

/** 新建自建上游：供应商 → 模型（多选）→ 计费模式 → key。桌面/移动共用 */
export function CreateUpstreamKeyDialog({ open, submitting, onClose, onDone }: {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const isMobile = useIsMobile();
  const [name, setName] = useState('');
  const [providerId, setProviderId] = useState('');
  const [modelIds, setModelIds] = useState<string[]>([]);
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const [billingMode, setBillingMode] = useState<'plan' | 'free'>('plan');
  const [keyText, setKeyText] = useState('');
  const { mutate } = useMutation();

  const { data: optionsData, loading: optionsLoading } = useAsync(
    () => (open ? getPanelUpstreamCreateOptionsApi() : Promise.resolve(null)),
    [open],
  );
  const providers: UpstreamProviderOption[] = optionsData?.providers ?? [];

  const { data: modelsData, loading: modelsLoading } = useAsync(
    () => (open && providerId ? getPanelUpstreamCreateOptionsApi(providerId) : Promise.resolve(null)),
    [open, providerId],
  );
  const models: UpstreamModelOption[] = modelsData?.models ?? [];

  useEffect(() => {
    if (open) { setName(''); setProviderId(''); setModelIds([]); setNameOverrides({}); setBillingMode('plan'); setKeyText(''); }
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // 只送非空覆盖（空串=用模板值）
    const upstreamNames = Object.fromEntries(
      modelIds.map((id) => [id, (nameOverrides[id] ?? '').trim()]).filter(([, v]) => v !== ''),
    );
    mutate(() => createPanelUpstreamKeyApi({
      provider_id: providerId,
      name: name.trim(),
      key: keyText.trim(),
      billing_mode: billingMode,
      model_ids: modelIds,
      ...(Object.keys(upstreamNames).length > 0 ? { upstream_names: upstreamNames } : {}),
    }), { successMsg: '已创建，约 30 秒后生效', onSuccess: onDone }).catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>新建自建上游</DialogTitle>
          <DialogDescription>选择供应商与模型（沿用平台目录的接入方式），填入你的 API Key。创建后请求会优先走你的 Key。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>供应商</Label>
            <Select value={providerId} onValueChange={(v) => { setProviderId(v); setModelIds([]); setNameOverrides({}); }} disabled={optionsLoading || providers.length === 0}>
              <SelectTrigger className="w-full"><SelectValue placeholder={optionsLoading ? '加载中…' : providers.length === 0 ? '暂无可选供应商' : '选择供应商'} /></SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-baseline gap-2">
                      <span>{p.display_name || p.name}</span>
                      {p.base_url && <span className="font-mono text-xs text-muted-foreground">{p.base_url}</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>模型（可多选，括号内为转发名）</Label>
            <UpstreamModelSelect
              models={models}
              selectedIds={modelIds}
              onChange={setModelIds}
              names={nameOverrides}
              onNamesChange={setNameOverrides}
              placeholder={providerId === '' ? '先选择供应商' : modelsLoading ? '加载中…' : '选择要开通的模型'}
              disabled={providerId === '' || modelsLoading || models.length === 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label>计费模式</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setBillingMode('plan')}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${billingMode === 'plan' ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'}`}>
                <div className="font-medium">照常扣费</div>
                <div className="mt-0.5 text-xs text-muted-foreground">走此 Key 的请求按套餐正常计量（倍率/Token）</div>
              </button>
              <button type="button" onClick={() => setBillingMode('free')}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${billingMode === 'free' ? 'border-emerald-500 bg-emerald-50' : 'hover:bg-accent/50'}`}>
                <div className="font-medium">免扣套餐</div>
                <div className="mt-0.5 text-xs text-muted-foreground">流量自费、不耗套餐额度；额度耗尽时仍可用此 Key</div>
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-name">名称</Label>
              <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：我的官方 Key" autoFocus={!isMobile} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-key">API Key</Label>
              <Input id="u-key" value={keyText} onChange={(e) => setKeyText(e.target.value)} placeholder="sk-…" className="font-mono" />
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Key 加密存储、仅显示首尾 4 位；计费模式可随时在编辑里切换。创建后约 30 秒内路由生效。</span>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={submitting || providerId === '' || modelIds.length === 0 || keyText.trim().length < 8}>
              {submitting ? '创建中…' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 编辑：改名 / 切计费模式 / 换 Key。桌面/移动共用 */
export function EditUpstreamKeyDialog({ row, submitting, onClose, onDone }: {
  row: UpstreamKeyItem | null;
  submitting: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const isMobile = useIsMobile();
  const [name, setName] = useState('');
  const [billingMode, setBillingMode] = useState<'plan' | 'free'>('plan');
  const [keyText, setKeyText] = useState('');
  const [providerId, setProviderId] = useState('');
  const [modelIds, setModelIds] = useState<string[]>([]);
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const { mutate } = useMutation();
  const open = row !== null;
  useEffect(() => {
    if (open && row) {
      setName(row.name);
      setBillingMode(row.billing_mode === 'free' ? 'free' : 'plan');
      setKeyText('');
      setProviderId(row.provider_id);
      setModelIds([]);
      setNameOverrides({});
    }
  }, [open, row]);

  // 可选供应商（换供应商用）
  const { data: optionsData, loading: providersLoading } = useAsync(
    () => (open ? getPanelUpstreamCreateOptionsApi() : Promise.resolve(null)),
    [open],
  );
  const providers = optionsData?.providers ?? [];
  // 换了供应商时，加载新供应商的可选模型（须重选）
  const switching = open && row !== null && providerId !== '' && providerId !== row.provider_id;
  const { data: modelsData, loading: modelsLoading } = useAsync(
    () => (switching && providerId ? getPanelUpstreamCreateOptionsApi(providerId) : Promise.resolve(null)),
    [switching, providerId],
  );
  const switchModels = modelsData?.models ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!row) return;
    const upstreamNames = Object.fromEntries(
      modelIds.map((id) => [id, (nameOverrides[id] ?? '').trim()]).filter(([, v]) => v !== ''),
    );
    mutate(() => updatePanelUpstreamKeyApi(row.id, {
      ...(name.trim() !== row.name ? { name: name.trim() } : {}),
      ...(billingMode !== row.billing_mode ? { billing_mode: billingMode } : {}),
      ...(keyText.trim() !== '' ? { key: keyText.trim() } : {}),
      ...(switching ? {
        provider_id: providerId,
        model_ids: modelIds,
        ...(Object.keys(upstreamNames).length > 0 ? { upstream_names: upstreamNames } : {}),
      } : {}),
    }), { successMsg: switching ? '已保存，模型映射已按新供应商重建' : '已保存', onSuccess: onDone }).catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>编辑自建上游</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="e-name">名称</Label>
            <Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!isMobile} />
          </div>
          <div className="space-y-1.5">
            <Label>供应商</Label>
            <Select value={providerId} onValueChange={(v) => { setProviderId(v); setModelIds([]); setNameOverrides({}); }} disabled={providersLoading || providers.length === 0}>
              <SelectTrigger className="w-full"><SelectValue placeholder={providersLoading ? '加载中…' : '选择供应商'} /></SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-baseline gap-2">
                      <span>{p.display_name || p.name}</span>
                      {p.base_url && <span className="font-mono text-xs text-muted-foreground">{p.base_url}</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {switching && (
            <div className="space-y-1.5">
              <Label>模型（换供应商后须重选，括号内为转发名）</Label>
              <UpstreamModelSelect
                models={switchModels}
                selectedIds={modelIds}
                onChange={setModelIds}
                names={nameOverrides}
                onNamesChange={setNameOverrides}
                placeholder={modelsLoading ? '加载中…' : '选择要开通的模型'}
                disabled={modelsLoading || switchModels.length === 0}
              />
              <p className="text-xs text-muted-foreground">更换供应商会清空现有模型映射并按新供应商重建。</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>计费模式</Label>
            <Select value={billingMode} onValueChange={(v) => setBillingMode(v as 'plan' | 'free')}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="plan">照常扣费（按套餐计量）</SelectItem>
                <SelectItem value="free">免扣套餐（流量自费）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-key">更换 API Key（可选）</Label>
            <Input id="e-key" value={keyText} onChange={(e) => setKeyText(e.target.value)} placeholder={`留空保持不变（${row?.key_prefix}…${row?.key_suffix}）`} className="font-mono" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={submitting || (switching && modelIds.length === 0)}>{submitting ? '保存中…' : '保存'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 详情：模型映射（增删）+ 探测 + 校验记录。桌面/移动共用 */
export function UpstreamKeyDetailDialog({ keyId, onClose, onChanged }: {
  keyId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const open = keyId !== null;
  const { data, loading, reload } = useAsync(
    () => (open && keyId ? getPanelUpstreamKeyDetailApi(keyId) : Promise.resolve(null)),
    [open, keyId],
  );
  const [probe, setProbe] = useState<UpstreamProbeResult | null>(null);
  const [addModels, setAddModels] = useState<string[]>([]);
  const [addNameOverrides, setAddNameOverrides] = useState<Record<string, string>>({});
  const [providerId, setProviderId] = useState('');
  // 行内改转发名：mappingId → 编辑中的名字（null=未编辑）
  const [renaming, setRenaming] = useState<Record<string, string>>({});
  const { loading: probing, mutate: runProbe } = useMutation();
  const { loading: mutating, mutate } = useMutation();
  useEffect(() => { setProbe(null); setAddModels([]); setAddNameOverrides({}); setProviderId(''); setRenaming({}); }, [keyId]);

  // 增模型所需的可选列表（当前 key 的供应商）
  const key = data?.key;
  useEffect(() => { if (key?.provider_id) setProviderId(key.provider_id); }, [key?.provider_id]);
  const { data: modelsData } = useAsync(
    () => (open && providerId ? getPanelUpstreamCreateOptionsApi(providerId) : Promise.resolve(null)),
    [open, providerId],
  );
  const mappedModelIds = new Set((data?.mappings ?? []).filter((m) => m.status !== 'deleted').map((m) => m.model_id));
  const addableModels = (modelsData?.models ?? []).filter((m) => !mappedModelIds.has(m.id));

  const onProbe = () => {
    if (!keyId) return;
    runProbe(() => probePanelUpstreamKeyApi(keyId), { successMsg: '探测完成', onSuccess: (r) => { setProbe(r); reload(); } }).catch(() => {});
  };
  const onAddModels = () => {
    if (!keyId || addModels.length === 0) return;
    const upstreamNames = Object.fromEntries(
      addModels.map((id) => [id, (addNameOverrides[id] ?? '').trim()]).filter(([, v]) => v !== ''),
    );
    mutate(() => addPanelUpstreamKeyModelsApi(keyId, addModels, Object.keys(upstreamNames).length > 0 ? upstreamNames : undefined), {
      successMsg: '已添加',
      onSuccess: () => { setAddModels([]); setAddNameOverrides({}); reload(); onChanged(); },
    }).catch(() => {});
  };
  const onRenameModel = (mappingId: string) => {
    if (!keyId) return;
    const next = (renaming[mappingId] ?? '').trim();
    if (next === '') return;
    mutate(() => updatePanelUpstreamKeyModelApi(keyId, mappingId, next), {
      successMsg: '转发名已更新',
      onSuccess: () => { setRenaming((r) => { const n = { ...r }; delete n[mappingId]; return n; }); reload(); },
    }).catch(() => {});
  };
  const onRemoveModel = (mappingId: string) => {
    if (!keyId) return;
    mutate(() => removePanelUpstreamKeyModelApi(keyId, mappingId), { successMsg: '已移除', onSuccess: () => { reload(); onChanged(); } }).catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {key?.name ?? '上游详情'}
            {key && <BillingModeBadge mode={key.billing_mode} />}
          </DialogTitle>
          <DialogDescription>
            {key ? `${key.key_prefix}…${key.key_suffix} · ${key.provider?.display_name || (key.provider?.name ?? '')}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading || !data ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto">
            {/* 探测 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">连通性探测</span>
                <Button type="button" size="sm" variant="outline" onClick={onProbe} disabled={probing}>
                  <PlugZap className={`mr-1.5 h-4 w-4 ${probing ? 'animate-pulse' : ''}`} />{probing ? '探测中…' : '立即探测'}
                </Button>
              </div>
              {probe && (
                <div className={`rounded-md border px-3 py-2 text-xs ${probe.status === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}>
                  {probe.status === 'success' ? '探测成功' : `探测失败（${probe.error_code || probe.http_status}）`}
                  {probe.latency_ms > 0 && ` · ${probe.latency_ms}ms`}
                  {probe.error_message && <div className="mt-1 break-all opacity-80">{probe.error_message}</div>}
                </div>
              )}
            </div>

            {/* 模型映射 */}
            <div className="space-y-2">
              <span className="text-sm font-medium">已开通模型（{data.mappings.filter((m) => m.status !== 'deleted').length}）</span>
              <div className="divide-y rounded-md border">
                {data.mappings.filter((m) => m.status !== 'deleted').map((m) => (
                  <div key={m.id} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{m.model?.name ?? m.model_id}</div>
                        <div className="truncate font-mono text-xs text-muted-foreground">→ {m.upstream_model_name ?? m.model?.name ?? '—'}</div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setRenaming((r) => ({ ...r, [m.id]: r[m.id] ?? (m.upstream_model_name ?? m.model?.name ?? '') }))} disabled={mutating}>
                          改转发名
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => onRemoveModel(m.id)} disabled={mutating}>
                          移除
                        </Button>
                      </div>
                    </div>
                    {renaming[m.id] !== undefined && (
                      <div className="mt-2 flex items-center gap-2">
                        <Input
                          value={renaming[m.id]}
                          onChange={(e) => setRenaming((r) => ({ ...r, [m.id]: e.target.value }))}
                          placeholder="上游侧真实模型名"
                          className="h-8 flex-1 font-mono text-xs"
                        />
                        <Button type="button" size="sm" className="h-8" onClick={() => onRenameModel(m.id)} disabled={mutating || (renaming[m.id] ?? '').trim() === ''}>保存</Button>
                        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setRenaming((r) => { const n = { ...r }; delete n[m.id]; return n; })}>取消</Button>
                      </div>
                    )}
                  </div>
                ))}
                {data.mappings.filter((m) => m.status !== 'deleted').length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">未开通任何模型</div>
                )}
              </div>
              {addableModels.length > 0 && (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <UpstreamModelSelect
                      models={addableModels}
                      selectedIds={addModels}
                      onChange={setAddModels}
                      names={addNameOverrides}
                      onNamesChange={setAddNameOverrides}
                      placeholder="添加模型"
                      disabled={mutating}
                    />
                  </div>
                  <Button type="button" size="sm" variant="outline" className="mt-1" onClick={onAddModels} disabled={addModels.length === 0 || mutating}>添加</Button>
                </div>
              )}
            </div>

            {/* 校验记录 */}
            <div className="space-y-2">
              <span className="text-sm font-medium">探测记录</span>
              <div className="divide-y rounded-md border">
                {data.verifications.slice(0, 5).map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className={v.status === 'success' ? 'text-emerald-600' : 'text-destructive'}>
                      {v.status === 'success' ? '成功' : `失败 ${v.error_code ?? ''}`}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {v.http_status ? `HTTP ${v.http_status} · ` : ''}{v.latency_ms}ms · {formatDateTime(v.created_at)}
                    </span>
                  </div>
                ))}
                {data.verifications.length === 0 && <div className="px-3 py-4 text-center text-xs text-muted-foreground">暂无记录</div>}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
