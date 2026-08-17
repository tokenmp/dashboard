import { useState } from 'react';
import { RefreshCw, Plus, PlugZap } from 'lucide-react';
import { getPanelUpstreamKeysApi, updatePanelUpstreamKeyStatusApi } from '@/api/panel';
import { useAsync } from '@/hooks/useAsync';
import { useMutation } from '@/hooks/useMutation';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { formatDate } from '@/utils/format';
import type { UpstreamKeyItem } from '@/types/upstream';
import { BillingModeBadge, VerifiedCell, CreateUpstreamKeyDialog, EditUpstreamKeyDialog, UpstreamKeyDetailDialog } from './Upstream.shared';

/** 「我的上游」移动视图：卡片流 + 复用桌面版共享对话框 */
export function UpstreamMobile() {
  const { data, loading, error, reload } = useAsync(() => getPanelUpstreamKeysApi({ size: 100, sort: '-created_at' }));
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UpstreamKeyItem | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { loading: submitting, mutate } = useMutation();

  const keys = data?.list ?? [];

  const onToggle = (row: UpstreamKeyItem) =>
    mutate(() => updatePanelUpstreamKeyStatusApi(row.id, row.status === 'active' ? 'disabled' : 'active'), {
      successMsg: row.status === 'active' ? '已停用' : '已启用',
      onSuccess: () => reload(),
    }).catch(() => {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl font-bold">我的上游</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">自带 API Key，优先于平台渠道</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-4 w-4" />新建</Button>
          <Button variant="outline" size="icon" onClick={reload} disabled={loading} aria-label="刷新">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : keys.length === 0 ? (
        <EmptyState title="还没有自建上游" description="点右上角「新建」，带上自己的 API Key 出流量" />
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <Card key={k.id} className="py-0">
              <CardContent className="divide-y">
                <button type="button" className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left" onClick={() => setDetailId(k.id)}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{k.name}</span>
                      <BillingModeBadge mode={k.billing_mode} />
                      <StatusBadge status={k.status} />
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {k.provider?.display_name || k.provider?.name || '—'} · {k.key_prefix}…{k.key_suffix}
                    </div>
                  </div>
                  <PlugZap className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <VerifiedCell row={k} />
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{formatDate(k.created_at)}</span>
                    <Switch checked={k.status === 'active'} onCheckedChange={() => onToggle(k)} aria-label="启停" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateUpstreamKeyDialog open={createOpen} submitting={submitting} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); reload(); }} />
      <EditUpstreamKeyDialog row={editing} submitting={submitting} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />
      <UpstreamKeyDetailDialog keyId={detailId} onClose={() => setDetailId(null)} onChanged={reload} />
    </div>
  );
}
