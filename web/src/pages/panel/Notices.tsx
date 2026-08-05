import { RefreshCw } from 'lucide-react';
import { getPanelNoticesApi } from '@/api/panel';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { SeverityChip } from '@/components/SeverityChip';
import { Markdown } from '@/components/Markdown';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/utils/format';
import type { SystemQuery, AnnouncementItem } from '@/types/system';

function Notices() {
  const { list, total, page, size, loading, error, reload, setPage } = usePagedQuery(getNoticesApiLazy, { initial: { size: 10, sort: '-publish_from' } as SystemQuery });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">公告</h1>
          <p className="mt-1 text-sm text-muted-foreground">平台公告与通知</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
      </div>

      {error && <Card className="border-destructive"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      {loading && list.length === 0 ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        : list.length === 0 ? <EmptyState title="暂无公告" /> : (
          <div className="space-y-2">
            {list.map((item) => <NoticeRow key={item.id} item={item} />)}
          </div>
        )}

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>第 {page} / {Math.max(1, Math.ceil(total / size))} 页 · 共 {formatNumber(total)} 条</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / size) || loading} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      )}
    </div>
  );
}

const getNoticesApiLazy = (p: SystemQuery) => getPanelNoticesApi(p);

function NoticeRow({ item }: { item: AnnouncementItem }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityChip severity={item.severity} />
            <span className="font-medium">{item.title}</span>
          </div>
          <span className="font-mono text-xs text-muted-foreground">{item.publish_from?.slice(0, 10)}</span>
        </div>
        {item.body && <Markdown className="mt-2 text-muted-foreground">{item.body}</Markdown>}
      </CardContent>
    </Card>
  );
}

export default Notices;
