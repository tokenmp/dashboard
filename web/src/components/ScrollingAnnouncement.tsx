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

const ITEM_HEIGHT_REM = 2.5;
const ROTATION_INTERVAL_MS = 5_000;

/** 带重试的拉取：应对 dev 环境 php -S 单线程并发排队导致的偶发超时。 */
async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // 最后一次不再等待
      if (attempt === retries) break;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * 模块级公告缓存：按 fetcher 引用缓存最近一次结果。
 * 避免路由切换导致组件重挂时清空公告（短暂空白/闪烁）。
 * 挂载时先用缓存立即渲染，再后台刷新。
 */
const noticeCache = new WeakMap<(...a: unknown[]) => Promise<unknown>, AnnouncementItem[]>();

/** Header 中的最新公告垂直轮播。 */
export function ScrollingAnnouncement({ fetcher, viewAllTo, itemTo, className }: Props) {
  const navigate = useNavigate();
  const [notices, setNotices] = useState<AnnouncementItem[]>(() => noticeCache.get(fetcher as never) ?? []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [transitionEnabled, setTransitionEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await fetchWithRetry(() => fetcher({ size: 5, sort: '-created_at' }));
        if (!cancelled) {
          const next = result.list.filter((notice) => notice.status === 'published').slice(0, 5);
          setNotices(next);
          setCurrentIndex(0);
          setTransitionEnabled(true);
          noticeCache.set(fetcher as never, next);
        }
      } catch (err) {
        // 公告不应阻塞 Header 或页面主体的正常展示；保留已有数据，仅控制台记录。
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('[ScrollingAnnouncement] 加载失败：', err);
        }
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
      // 到达末尾副本后，先无动画复位到 0，下一轮再滚动；避免索引无界增长。
      setCurrentIndex((index) => (index >= notices.length ? 0 : index + 1));
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
        'flex h-11 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md border bg-muted/40 px-2',
        className,
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Megaphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="h-10 min-w-0 flex-1 overflow-hidden">
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
            const itemClassName = 'block h-10 w-full shrink-0 overflow-hidden p-0 text-left leading-none';
            const inner = (
              <>
                <div className="line-clamp-1 text-xs font-medium leading-5">{notice.title}</div>
                {notice.body && (
                  <div className="line-clamp-1 text-[11px] leading-5 text-muted-foreground">{notice.body}</div>
                )}
              </>
            );

            return to ? (
              <button
                key={`${notice.id}-${index}`}
                type="button"
                className={cn(itemClassName, 'cursor-pointer hover:text-primary')}
                onClick={() => navigate(to)}
                tabIndex={index === currentIndex ? 0 : -1}
                aria-hidden={index !== currentIndex}
              >
                {inner}
              </button>
            ) : (
              <div key={`${notice.id}-${index}`} className={itemClassName} aria-hidden={index !== currentIndex}>
                {inner}
              </div>
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
