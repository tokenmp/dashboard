import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getPanelReleasesApi } from '@/api/panel';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MobileCard, MobilePageHeader, MobilePagination } from '@/components/mobile';
import { formatDate } from '@/utils/format';
import { ReleaseDetailDrawer } from './Releases';
import type { SystemQuery, VersionReleaseItem } from '@/types/system';

/** 发布类型中文徽标映射（取值与后台发布表单一致：feature/fix/improvement/perf），未知类型原样展示 */
const RELEASE_TYPE_LABEL: Record<string, string> = {
  feature: '新',
  fix: '修复',
  improvement: '功能',
  perf: '优化',
};

/** 发布类型徽标：「新」（feature）沿用 SeverityChip 的信息蓝着色作主视觉，其余为中性弱化样式。 */
function ReleaseTypeBadge({ type }: { type: string }) {
  const label = RELEASE_TYPE_LABEL[type] ?? type;
  const cls = type === 'feature' ? 'bg-sky-100 text-sky-700' : 'border bg-muted/60 text-muted-foreground';
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

/**
 * 用户面·更新日志（移动视图）：卡片流（版本号 + 类型徽标 + 发布日期 + 两行摘要）+ 紧凑分页。
 * 数据 API、排序与桌面视图一致；详情复用 Releases.tsx 导出的 ReleaseDetailDrawer（移动端底部滑出）。
 */
export function ReleasesMobile() {
  const [detailId, setDetailId] = useState<string | null>(null);
  const { list, total, page, size, loading, error, reload, setPage } = usePagedQuery(
    (p) => getPanelReleasesApi(p as SystemQuery),
    { initial: { size: 20, sort: '-sort_order' } as SystemQuery },
  );

  return (
    <div className="space-y-3">
      {/* 页头 */}
      <MobilePageHeader
        title="更新日志"
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
        <EmptyState title="暂无版本发布" />
      ) : (
        <div className="space-y-[7px]">
          {list.map((item) => (
            <ReleaseCard key={item.id} item={item} onClick={() => setDetailId(item.id)} />
          ))}
        </div>
      )}

      {/* 分页 */}
      {total > 0 && <MobilePagination page={page} size={size} total={total} onPageChange={setPage} />}

      {/* 详情抽屉（与桌面共用同一 ReleaseDetailDrawer） */}
      <ReleaseDetailDrawer id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

/* ----------------------------- 版本卡片 ----------------------------- */

/** 单个版本的移动卡片：标题=版本号（mono）、徽标=发布类型、副行=发布日期、摘要两行截断。 */
function ReleaseCard({ item, onClick }: { item: VersionReleaseItem; onClick: () => void }) {
  return (
    <MobileCard
      title={<span className="font-mono">{item.version}</span>}
      badge={<ReleaseTypeBadge type={item.release_type} />}
      subtitle={formatDate(item.released_at)}
      onClick={onClick}
    >
      {item.summary && <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-[1.6] text-muted-foreground">{item.summary}</p>}
    </MobileCard>
  );
}
