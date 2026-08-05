import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { getMyNotificationsApi } from '@/api/system';
import type { NotificationItem } from '@/types/system';
import { cn } from '@/lib/utils';

/**
 * 通知铃铛：下拉展示最近通知，带未读计数徽章。
 * 管理端 Layout 与用户端 PanelLayout 共用。
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getMyNotificationsApi({ size: 8, sort: '-created_at' });
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
              {loading && <span className="text-xs text-muted-foreground">加载中…</span>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {list.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">暂无通知</div>
              ) : list.map((n) => (
                <div key={n.id} className={cn('border-b px-3 py-2 last:border-0', !n.read_at && 'bg-accent/40')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium line-clamp-1">{n.title}</span>
                    {!n.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  </div>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={n.severity} />
                    <span className="text-[10px] text-muted-foreground">{n.created_at}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default NotificationBell;
