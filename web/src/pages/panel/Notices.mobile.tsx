import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getPanelNoticesApi } from '@/api/panel';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { SeverityChip } from '@/components/SeverityChip';
import { Markdown } from '@/components/Markdown';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { MobileCard, MobilePageHeader, MobilePagination, DetailSheetContent } from '@/components/mobile';
import type { SystemQuery, AnnouncementItem } from '@/types/system';

/**
 * 用户面·公告（移动视图）：卡片流（标题 + severity 徽标 + 发布日期 + 两行摘要）+ 紧凑分页。
 * 数据 API、排序与桌面视图一致；severity 徽标沿用桌面同款 SeverityChip 映射；
 * 详情为底部抽屉，正文 Markdown 复用页面现有渲染组件（body 随列表返回，无需二次请求）。
 */
export function NoticesMobile() {
  const [detail, setDetail] = useState<AnnouncementItem | null>(null);
  const { list, total, page, size, loading, error, reload, setPage } = usePagedQuery(
    (p) => getPanelNoticesApi(p as SystemQuery),
    { initial: { size: 10, sort: '-publish_from' } as SystemQuery },
  );

  return (
    <div className="space-y-3">
      {/* 页头 */}
      <MobilePageHeader
        title="公告"
        action={
          <Button variant="outline" size="sm" className="h-[30px] rounded-lg px-2.5" onClick={reload} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        }
      />

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-2.5 text-[13px] text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* 卡片流 */}
      {loading && list.length === 0 ? (
        <div className="space-y-[7px]">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="暂无公告" />
      ) : (
        <div className="space-y-[7px]">
          {list.map((item) => (
            <NoticeCard key={item.id} item={item} onClick={() => setDetail(item)} />
          ))}
        </div>
      )}

      {/* 分页 */}
      {total > 0 && <MobilePagination page={page} size={size} total={total} onPageChange={setPage} />}

      {/* 详情底部抽屉：标题 + 日期 + severity + 正文 Markdown */}
      <Sheet open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DetailSheetContent>
          <SheetHeader><SheetTitle>公告详情</SheetTitle></SheetHeader>
          {detail && (
            <div className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <SeverityChip severity={detail.severity} />
                <span className="font-mono text-xs text-muted-foreground">{detail.publish_from?.slice(0, 10)}</span>
              </div>
              <h2 className="text-lg font-semibold">{detail.title}</h2>
              <div className="rounded-lg border bg-muted/30 p-4">
                <Markdown>{detail.body}</Markdown>
              </div>
            </div>
          )}
        </DetailSheetContent>
      </Sheet>
    </div>
  );
}

/* ----------------------------- 公告卡片 ----------------------------- */

/** 单条公告的移动卡片：标题=公告名、徽标=severity（桌面同款 SeverityChip）、副行=发布日期、正文摘要两行截断。 */
function NoticeCard({ item, onClick }: { item: AnnouncementItem; onClick: () => void }) {
  return (
    <MobileCard
      title={item.title}
      badge={<SeverityChip severity={item.severity} />}
      subtitle={item.publish_from?.slice(0, 10)}
      onClick={onClick}
    >
      {/* 正文摘要：两行截断，完整 Markdown 在详情抽屉中渲染 */}
      {item.body && <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-[1.6] text-muted-foreground">{item.body}</p>}
    </MobileCard>
  );
}
