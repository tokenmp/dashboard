import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { PageResult } from '@/types/common';
import type { AnnouncementItem } from '@/types/system';

interface Props {
  /** 拉取公告的 API，返回 PageResult<AnnouncementItem> */
  fetcher: (params: { size: number; sort: string }) => Promise<PageResult<AnnouncementItem>>;
  /** 点“查看全部”跳转的路径 */
  viewAllTo: string;
  /** 点单条公告跳转的路径（传 null 则不可点） */
  itemTo?: (id: string) => string | null;
  className?: string;
}

const ITEM_HEIGHT_REM = 1.25;
const ROTATION_INTERVAL_MS = 4_000;

/** Header 中的最新公告垂直轮播。 */
export function ScrollingAnnouncement({ fetcher, viewAllTo, itemTo, className }: Props) {
  const navigate = useNavigate();
  const [notices, setNotices] = useState<AnnouncementItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [transitionEnabled, setTransitionEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await fetcher({ size: 5, sort: '-created_at' });
        if (!cancelled) {
          setNotices(result.list.filter((notice) => notice.status === 'published').slice(0, 5));
          setCurrentIndex(0);
          setTransitionEnabled(true);
        }
      } catch {
        // 公告不应阻塞 Header 或页面主体的正常展示。
        if (!cancelled) setNotices([]);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [fetcher]);

  useEffect(() => {
    if (notices.length <= 1 || paused) return;

    const timer = window.setInterval(() => {
      setCurrentIndex((index) => index + 1);
    }, ROTATION_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [notices.length, paused]);

  useEffect(() => {
    if (transitionEnabled) return;

    const frame = window.requestAnimationFrame(() => setTransitionEnabled(true));
    return () => window.cancelAnimationFrame(frame);
  }, [transitionEnabled]);

  if (notices.length === 0) return null;

  // 尾部复制第一条，滚到副本后无动画复位，保证循环方向始终向上。
  const displayedNotices = notices.length > 1 ? [...notices, notices[0]] : notices;

  return (
    <div
      className={cn(
        'flex h-7 min-w-0 max-w-md flex-1 items-center gap-2 overflow-hidden rounded-md border bg-muted/40 px-2',
        className,
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Megaphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="h-5 min-w-0 flex-1 overflow-hidden">
        <div
          className={transitionEnabled ? 'transition-transform duration-300 ease-in-out' : 'transition-none'}
          style={{ transform: `translateY(-${currentIndex * ITEM_HEIGHT_REM}rem)` }}
          onTransitionEnd={() => {
            if (currentIndex === notices.length) {
              setTransitionEnabled(false);
              setCurrentIndex(0);
            }
          }}
        >
          {displayedNotices.map((notice, index) => {
            const to = itemTo?.(notice.id) ?? null;
            const titleClassName = 'line-clamp-1 h-5 w-full text-left text-xs leading-5';

            return to ? (
              <button
                key={`${notice.id}-${index}`}
                type="button"
                className={cn(titleClassName, 'cursor-pointer hover:text-primary')}
                onClick={() => navigate(to)}
                tabIndex={index === currentIndex ? 0 : -1}
                aria-hidden={index !== currentIndex}
              >
                {notice.title}
              </button>
            ) : (
              <span key={`${notice.id}-${index}`} className={titleClassName} aria-hidden={index !== currentIndex}>
                {notice.title}
              </span>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        className="shrink-0 whitespace-nowrap text-xs text-primary hover:underline"
        onClick={() => navigate(viewAllTo)}
      >
        查看全部
      </button>
    </div>
  );
}

export default ScrollingAnnouncement;
