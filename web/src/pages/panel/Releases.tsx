import { useState } from 'react';
import { RefreshCw, BookOpen, CheckCircle2 } from 'lucide-react';
import { getPanelReleasesApi, getPanelReleaseDetailApi } from '@/api/panel';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAsync } from '@/hooks/useAsync';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { EmptyState } from '@/components/EmptyState';
import { Markdown } from '@/components/Markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DetailSheetContent } from '@/components/mobile';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime, formatNumber } from '@/utils/format';
import { ReleasesMobile } from './Releases.mobile';
import type { SystemQuery } from '@/types/system';

function ReleasesDesktop() {
  const { list, total, page, size, loading, error, reload, setPage } = usePagedQuery(
    (p) => getPanelReleasesApi(p as SystemQuery),
    { initial: { size: 20, sort: '-sort_order' } as SystemQuery },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">更新日志</h1>
          <p className="mt-1 text-sm text-muted-foreground">版本发布记录 · 共 {formatNumber(total)} 条</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading && list.length === 0 ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState title="暂无版本发布" />
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <ReleaseRow
              key={r.id}
              id={r.id}
              version={r.version}
              title={r.title}
              summary={r.summary}
              releaseType={r.release_type}
              releasedAt={r.released_at}
            />
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>第 {page} / {Math.max(1, Math.ceil(total / size))} 页</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / size) || loading} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReleaseRow({ id, version, title, summary, releaseType, releasedAt }: { id: string; version: string; title: string; summary: string | null; releaseType: string; releasedAt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card className="cursor-pointer transition-colors hover:bg-accent/50" onClick={() => setOpen(true)}>
        {/* 移动端收窄内边距（375px 下更舒适），sm 起恢复桌面密度 */}
        <CardContent className="p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="font-mono text-sm font-medium">{version}</span>
              <Badge variant="outline" className="text-[10px]">{releaseType}</Badge>
            </div>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{formatDate(releasedAt)}</span>
          </div>
          <div className="mt-1 font-medium">{title}</div>
          {summary && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{summary}</p>}
        </CardContent>
      </Card>
      <ReleaseDetailDrawer id={open ? id : null} onClose={() => setOpen(false)} />
    </>
  );
}

/** 版本详情抽屉（桌面/移动视图共用；移动端经 DetailSheetContent 从底部滑出）。 */
export function ReleaseDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, loading, error } = useAsync(() => (id ? getPanelReleaseDetailApi(id) : Promise.resolve(null)), [id]);
  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      {/* 响应式抽屉：桌面右侧滑出（w-full sm:max-w-2xl，与原版一致），移动端底部滑出 */}
      <DetailSheetContent>
        <SheetHeader><SheetTitle>版本详情</SheetTitle></SheetHeader>
        {id === null ? null : loading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : data ? (
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-[10px]">{data.release.version}</Badge>
              <Badge variant="outline" className="text-[10px]">{data.release.release_type}</Badge>
              {data.readAt && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3 w-3" />已读</span>
              )}
            </div>
            <h2 className="text-lg font-semibold">{data.release.title}</h2>
            {data.release.summary && <p className="text-sm text-muted-foreground">{data.release.summary}</p>}
            <div className="rounded-lg border bg-muted/30 p-4">
              <Markdown>{data.release.body}</Markdown>
            </div>
            <div className="text-xs text-muted-foreground">发布时间：{formatDateTime(data.release.released_at)}</div>
          </div>
        ) : null}
      </DetailSheetContent>
    </Sheet>
  );
}

/**
 * 更新日志页：按视口切换桌面视图 / 移动卡片视图（同一份数据 API 与分页模型）。
 */
export default function Releases() {
  const isMobile = useIsMobile();
  return isMobile ? <ReleasesMobile /> : <ReleasesDesktop />;
}
