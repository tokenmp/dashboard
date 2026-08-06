import { useEffect, useState } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SeverityChip } from '@/components/SeverityChip';
import { getPanelNotificationsApi, markPanelNotificationReadApi, markAllPanelNotificationsReadApi } from '@/api/panel';
import type { NotificationItem } from '@/types/system';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/format';

/**
 * 通知铃铛：下拉展示最近通知，带未读计数徽章。
 * 管理端 Layout 与用户端 PanelLayout 共用。
 *
 * - severity 用彩色 SeverityChip（与公告一致）
 * - 顶部"全部已读"按钮
 * - 单条点击通知体即标记已读（已读后不消失，仅去掉未读高亮）
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState<string | 'all' | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getPanelNotificationsApi({ size: 8, sort: '-created_at' });
      setList(res.list);
    } catch {
      // 忽略（如 401 由全局拦截器处理）
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const unread = list.filter((n) => !n.read_at).length;

  const markRead = async (id: string) => {
    const item = list.find((n) => n.id === id);
    if (!item || item.read_at) return; // 已读不重复标记
    // 乐观更新
    setList((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    setMarking(id);
    try {
      await markPanelNotificationReadApi(id);
    } catch {
      // 回滚
      setList((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: null } : n)));
    } finally {
      setMarking(null);
    }
  };

  const markAll = async () => {
    if (unread === 0) return;
    setMarking('all');
    const nowIso = new Date().toISOString();
    setList((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })));
    try {
      await markAllPanelNotificationsReadApi();
    } catch {
      await load(); // 失败回滚重载
    } finally {
      setMarking(null);
    }
  };

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={() => { setOpen((o) => !o); if (!open) load(); }} aria-label="通知">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <Badge variant="destructive" className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px]">
            {unread > 99 ? '99+' : unread}
          </Badge>
        )}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-popover p-1 shadow-md">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-medium">通知</span>
              <div className="flex items-center gap-2">
                {loading && <span className="text-xs text-muted-foreground">加载中…</span>}
                {unread > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={markAll}
                    disabled={marking === 'all'}
                  >
                    <CheckCheck className="mr-1 h-3.5 w-3.5" />
                    全部已读
                  </Button>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {list.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">暂无通知</div>
              ) : list.map((n) => {
                const isUnread = !n.read_at;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      'group cursor-pointer border-b px-3 py-2 last:border-0 hover:bg-accent/60',
                      isUnread && 'bg-accent/40',
                    )}
                    onClick={() => markRead(n.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium line-clamp-1">{n.title}</span>
                      {isUnread ? (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="未读" />
                      ) : (
                        <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                    <div className="mt-1 flex items-center gap-2">
                      <SeverityChip severity={n.severity} />
                      <span className="text-[10px] text-muted-foreground">{formatDateTime(n.created_at)}</span>
                      {n.action_url && n.action_label && (
                        <a
                          href={n.action_url}
                          onClick={(e) => e.stopPropagation()}
                          className="ml-auto text-[10px] font-medium text-primary hover:underline"
                        >
                          {n.action_label}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default NotificationBell;
