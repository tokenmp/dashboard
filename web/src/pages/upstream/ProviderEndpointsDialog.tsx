import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  createProviderEndpointApi,
  deleteProviderEndpointApi,
  getProviderEndpointsApi,
  updateProviderEndpointApi,
} from '@/api/dashboard';
import type { ProviderEndpointItem } from '@/types/upstream';
import { useAsync } from '@/hooks/useAsync';

type Draft = Partial<ProviderEndpointItem> & { protocol: string; path: string; status: string };

const EMPTY_DRAFT: Draft = { protocol: '', path: '', status: 'active', kind: '', adapter: '', method: 'POST', auth_type: 'bearer', request_mode: '' };

/** 协议预设：选中协议后自动填充 path/kind/adapter/method/auth_type */
const PROTOCOL_PRESETS: Record<string, { label: string; path: string; kind: string; adapter: string; method: string; auth_type: string }> = {
  openai_chat: { label: 'OpenAI Chat', path: '/v1/chat/completions', kind: 'llm.chat', adapter: 'openai.chat', method: 'POST', auth_type: 'bearer' },
  anthropic_messages: { label: 'Anthropic Messages', path: '/anthropic/v1/messages', kind: 'llm.message', adapter: 'anthropic.messages', method: 'POST', auth_type: 'x-api-key' },
  openai_responses: { label: 'OpenAI Responses', path: '/v1/responses', kind: 'llm.response', adapter: 'openai.responses', method: 'POST', auth_type: 'bearer' },
};

const KIND_OPTIONS = ['llm.chat', 'llm.message', 'llm.response'];
const ADAPTER_OPTIONS = ['openai.chat', 'anthropic.messages', 'openai.responses'];
const AUTH_TYPE_OPTIONS = ['bearer', 'x-api-key'];
const REQUEST_MODE_OPTIONS = ['passthrough'];

export function ProviderEndpointsDialog({
  open,
  onOpenChange,
  providerId,
  providerName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string | null;
  providerName?: string;
}) {
  const { data, loading, error, reload } = useAsync(
    () => (providerId && open ? getProviderEndpointsApi(providerId) : Promise.resolve<ProviderEndpointItem[]>([])),
    [providerId, open],
  );
  const endpoints = data ?? [];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftError, setDraftError] = useState('');

  const startCreate = () => { setDraft({ ...EMPTY_DRAFT }); setDraftError(''); };
  const startEdit = (e: ProviderEndpointItem) => {
    setDraft({ id: e.id, protocol: e.protocol, path: e.path, status: e.status, kind: e.kind ?? '', adapter: e.adapter ?? '', method: e.method ?? 'POST', auth_type: e.auth_type ?? 'bearer', request_mode: e.request_mode ?? '' });
    setDraftError('');
  };

  const save = async () => {
    if (!providerId || !draft) return;
    if (!draft.protocol.trim() || !draft.path.trim()) { setDraftError('protocol 与 path 必填'); return; }
    setSaving(true); setDraftError('');
    const body = {
      protocol: draft.protocol.trim(),
      path: draft.path.trim(),
      status: draft.status,
      kind: draft.kind?.trim() || null,
      adapter: draft.adapter?.trim() || null,
      method: draft.method || 'POST',
      auth_type: draft.auth_type || 'bearer',
      request_mode: draft.request_mode?.trim() || null,
    };
    try {
      if (draft.id) {
        await updateProviderEndpointApi(draft.id, body);
      } else {
        await createProviderEndpointApi(providerId, body);
      }
      setDraft(null);
      reload();
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const remove = (id: string) => setPendingRemove(id);
  const confirmRemove = async () => {
    if (!pendingRemove) return;
    try {
      await deleteProviderEndpointApi(pendingRemove);
      reload();
    } catch { /* ignore */ }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{providerName ? `${providerName} · 端点` : '端点编辑'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{endpoints.length} 个端点</span>
            <Button size="sm" variant="outline" onClick={startCreate} disabled={!!draft}><Plus className="mr-1.5 h-4 w-4" />新增端点</Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : endpoints.length === 0 && !draft ? (
            <p className="py-6 text-center text-sm text-muted-foreground">暂无端点</p>
          ) : (
            <div className="space-y-1.5">
              {endpoints.map((e) => (
                <div key={e.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <span className="font-mono text-xs">{e.protocol}</span>
                  <span className="flex-1 truncate font-mono text-xs text-muted-foreground">{e.path}</span>
                  <span className="text-xs text-muted-foreground">{e.kind ?? '—'}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${e.status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          )}

          {draft && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="text-sm font-medium">{draft.id ? '编辑端点' : '新增端点'}</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">协议 *</Label>
                  <Select
                    value={draft.protocol}
                    onValueChange={(v) => {
                      const preset = PROTOCOL_PRESETS[v];
                      setDraft({ ...draft, protocol: v, ...(preset ? { path: preset.path, kind: preset.kind, adapter: preset.adapter, method: preset.method, auth_type: preset.auth_type } : {}) });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="选择协议" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROTOCOL_PRESETS).map(([k, p]) => <SelectItem key={k} value={k}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">路径 *</Label>
                  <Input value={draft.path} onChange={(e) => setDraft({ ...draft, path: e.target.value })} placeholder="/v1/chat/completions" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">类型</Label>
                  <Select value={draft.kind ?? ''} onValueChange={(v) => setDraft({ ...draft, kind: v })}>
                    <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">（不选）</SelectItem>
                      {KIND_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">适配器</Label>
                  <Select value={draft.adapter ?? ''} onValueChange={(v) => setDraft({ ...draft, adapter: v })}>
                    <SelectTrigger><SelectValue placeholder="选择适配器" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">（不选）</SelectItem>
                      {ADAPTER_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">方法</Label>
                  <Input value={draft.method ?? ''} onChange={(e) => setDraft({ ...draft, method: e.target.value })} placeholder="POST" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">鉴权方式</Label>
                  <Select value={draft.auth_type ?? ''} onValueChange={(v) => setDraft({ ...draft, auth_type: v })}>
                    <SelectTrigger><SelectValue placeholder="选择鉴权方式" /></SelectTrigger>
                    <SelectContent>
                      {AUTH_TYPE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">请求模式</Label>
                  <Select value={draft.request_mode ?? ''} onValueChange={(v) => setDraft({ ...draft, request_mode: v })}>
                    <SelectTrigger><SelectValue placeholder="（不选）" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">（不选）</SelectItem>
                      {REQUEST_MODE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">状态</Label>
                  <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">active</SelectItem>
                      <SelectItem value="disabled">disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {draftError && <p className="text-sm text-destructive">{draftError}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDraft(null)}>取消</Button>
                <Button size="sm" onClick={save} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={!!pendingRemove}
      onOpenChange={(o) => !o && setPendingRemove(null)}
      title="删除端点"
      description="确认删除该端点？"
      confirmText="删除"
      variant="destructive"
      onConfirm={confirmRemove}
    />
    </>
  );
}
