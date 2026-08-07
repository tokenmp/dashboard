import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, Search, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MultiSelect } from '@/components/ui/multi-select';
import { EmptyState } from '@/components/EmptyState';
import { DebouncedInput } from '@/components/DebouncedInput';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCompact } from '@/utils/format';
import {
  getModelMappingsApi, createModelMappingApi, updateModelMappingApi, deleteModelMappingApi,
  getModelKeyOptionsApi, getRouteGroupsApi, type MappingPayload,
} from '@/api/dashboard';
import type { ModelMappingItem, RouteGroupOption, UpstreamKeyOption } from '@/types/upstream';

export function MappingManagePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const modelName = (location.state as { name?: string } | null)?.name ?? id ?? '模型';
  const [mappings, setMappings] = useState<ModelMappingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ModelMappingItem | null | 'new'>(null);
  const [routeGroups, setRouteGroups] = useState<RouteGroupOption[]>([]);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pendingDelete, setPendingDelete] = useState<ModelMappingItem | null>(null);

  const reload = useCallback(() => {
    if (!id) return;
    setLoading(true);
    getModelMappingsApi(id, { keyword: keyword || undefined, status: statusFilter === 'all' ? undefined : statusFilter }).then(setMappings).finally(() => setLoading(false));
  }, [id, keyword, statusFilter]);

  useEffect(() => { getRouteGroupsApi().then(setRouteGroups).catch(() => {}); }, []);
  useEffect(() => { reload(); }, [reload]);
  // 新建映射后刷新
  useEffect(() => {
    const h = () => reload();
    window.addEventListener('mapping-refresh', h);
    return () => window.removeEventListener('mapping-refresh', h);
  }, [reload]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/dashboard/upstream/models')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />返回模型
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{modelName}</h1>
          <p className="text-sm text-muted-foreground">映射管理</p>
        </div>
      </div>

      <Card><CardContent className="flex items-end gap-3 p-4">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">搜索</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <DebouncedInput className="pl-8" placeholder="搜索 Key / 供应商 / 模型名" value={keyword} onDebouncedChange={setKeyword} />
          </div>
        </div>
        <div className="w-[140px]">
          <label className="mb-1 block text-xs text-muted-foreground">状态</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="disabled">disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}><Plus className="mr-1.5 h-4 w-4" />添加映射</Button>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : mappings.length === 0 ? (
          <EmptyState className="mx-4 my-6" title="暂无映射" />
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>供应商</TableHead>
              <TableHead>上游 Key</TableHead>
              <TableHead>上游模型名</TableHead>
              <TableHead>路由组</TableHead>
              <TableHead className="text-right">最大输出</TableHead>
              <TableHead className="text-right">输入价/输出价</TableHead>
              <TableHead className="w-[90px]">状态</TableHead>
              <TableHead className="w-[90px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {mappings.map((mm) => (
                <TableRow key={mm.id}>
                  <TableCell className="text-xs">{mm.provider_display_name || mm.provider_name}</TableCell>
                  <TableCell className="text-xs" title={mm.upstream_key_name}>
                    <div className="max-w-[140px] truncate">{mm.upstream_key_name}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{mm.upstream_model_name || '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(mm.route_group_ids ?? []).map((gid) => {
                        const g = routeGroups.find((x) => x.id === gid);
                        return <Badge key={gid} variant="secondary" className="text-[10px]">{g?.display_name || g?.name || gid.slice(0, 8)}</Badge>;
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-xs">{mm.max_tokens ? formatCompact(mm.max_tokens) : '—'}</TableCell>
                  <TableCell className="text-right text-xs">
                    {fmtPrice(mm.input_price_per_token)} / {fmtPrice(mm.output_price_per_token)}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-xs">
                      <span className={mm.status === 'active' ? 'text-emerald-600' : 'text-red-500'}>●</span>
                      {mm.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="编辑" onClick={() => setEditing(mm)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" title="删除" onClick={() => setPendingDelete(mm)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? '添加映射' : '编辑映射'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <MappingEditForm
              mapping={editing === 'new' ? null : editing}
              modelId={id ?? ''}
              routeGroups={routeGroups}
              existingKeyIds={mappings.filter((x) => x.id !== (editing === 'new' ? '' : editing?.id)).map((mm) => mm.upstream_key_id)}
              onClose={() => setEditing(null)}
              onSaved={() => { setEditing(null); reload(); }}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="删除映射"
        description="确定删除此映射？删除后不可恢复。"
        confirmText="删除"
        variant="destructive"
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteModelMappingApi(pendingDelete.id);
          setMappings((prev) => prev.filter((x) => x.id !== pendingDelete.id));
        }}
      />
    </div>
  );
}

function fmtPrice(v: number | null): string {
  if (v == null) return '—';
  return (v * 1_000_000).toFixed(4);
}

interface MappingEditFormProps {
  mapping: ModelMappingItem | null;
  modelId: string;
  routeGroups: RouteGroupOption[];
  existingKeyIds: string[];
  onClose: () => void;
  onSaved: () => void;
}

function MappingEditForm({ mapping, modelId, routeGroups, existingKeyIds, onClose, onSaved }: MappingEditFormProps) {
  const isEdit = !!mapping;
  const [keyId, setKeyId] = useState(mapping?.upstream_key_id ?? '');
  const [upstreamModelName, setUpstreamModelName] = useState(mapping?.upstream_model_name ?? '');
  const [inputPrice, setInputPrice] = useState(mapping?.input_price_per_token != null ? (mapping.input_price_per_token * 1_000_000).toString() : '');
  const [outputPrice, setOutputPrice] = useState(mapping?.output_price_per_token != null ? (mapping.output_price_per_token * 1_000_000).toString() : '');
  const [maxTokens, setMaxTokens] = useState(mapping?.max_tokens?.toString() ?? '');
  const [active, setActive] = useState(mapping?.status !== 'disabled');
  const [keyOptions, setKeyOptions] = useState<UpstreamKeyOption[]>([]);
  const [routeGroupIds, setRouteGroupIds] = useState<string[]>(mapping?.route_group_ids ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getModelKeyOptionsApi().then(setKeyOptions).catch(() => {});
  }, []);

  // 新建时默认勾选 default 组
  useEffect(() => {
    if (!mapping && routeGroupIds.length === 0) {
      const def = routeGroups.find((g) => g.name === 'default');
      if (def) setRouteGroupIds([def.id]);
    }
  }, [mapping, routeGroups, routeGroupIds]);

  const submit = async () => {
    setError('');
    if (!keyId) { setError('必须选择上游 Key'); return; }
    const payload: MappingPayload = {
      upstream_key_id: keyId,
      upstream_model_name: upstreamModelName.trim() || null,
      input_price_per_token: inputPrice.trim() === '' ? null : Number(inputPrice) / 1_000_000,
      output_price_per_token: outputPrice.trim() === '' ? null : Number(outputPrice) / 1_000_000,
      max_tokens: maxTokens.trim() === '' ? null : Number(maxTokens),
      status: active ? 'active' : 'disabled',
      provider_endpoint_id: null,
      route_group_ids: routeGroupIds,
    };
    setSaving(true);
    try {
      if (isEdit && mapping) {
        await updateModelMappingApi(mapping.id, payload);
        onSaved();
      } else {
        await createModelMappingApi(modelId, payload);
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
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>上游 Key *</Label>
          <SearchableSelect
            options={keyOptions.map((k) => ({ value: k.id, label: k.name, hint: k.provider_display_name || k.provider_name }))}
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
          <Select value={active ? 'active' : 'disabled'} onValueChange={(v) => setActive(v === 'active')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="disabled">disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>路由组</Label>
        <MultiSelect
          options={routeGroups.map((g) => ({ value: g.id, label: g.display_name || g.name, hint: g.is_system ? '系统' : undefined }))}
          value={routeGroupIds}
          onChange={setRouteGroupIds}
          placeholder="选择路由组"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>取消</Button>
        <Button size="sm" onClick={submit} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
      </div>
    </div>
  );
}
