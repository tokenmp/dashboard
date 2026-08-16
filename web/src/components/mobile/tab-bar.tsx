import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Ellipsis } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface MobileTabItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface MobileNavGroup {
  label?: string;
  items: MobileTabItem[];
}

interface MobileTabBarProps {
  /** 底部直达 Tab（建议 ≤5 个） */
  tabs: MobileTabItem[];
  /** 传入则追加「更多」Tab（底部 Sheet 分组导航）；panel 五 Tab 模式不传 */
  moreGroups?: MobileNavGroup[];
  /** 「更多」Sheet 底部动作区（如登出按钮） */
  moreFooter?: React.ReactNode;
  /** 「更多」面板标题 */
  moreTitle?: string;
}

/**
 * 移动端底部 Tab 导航（<md 显示）。放在布局列尾（main 之后）自然固定于底部；
 * 含 iPhone 安全区适配。紧凑规范：图标 18px、文字 10px。
 */
export function MobileTabBar({ tabs, moreGroups, moreFooter, moreTitle = '更多' }: MobileTabBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const hasMore = !!moreGroups && moreGroups.length > 0;

  return (
    <>
      <nav
        aria-label="移动端导航"
        className="flex shrink-0 items-stretch border-t bg-background/95 pb-safe backdrop-blur md:hidden"
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 pb-1 pt-1.5 text-[10px]',
                isActive ? 'font-semibold text-primary' : 'text-muted-foreground',
              )
            }
          >
            <tab.icon className="h-[18px] w-[18px]" />
            {tab.label}
          </NavLink>
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-1 flex-col items-center gap-0.5 pb-1 pt-1.5 text-[10px] text-muted-foreground"
          >
            <Ellipsis className="h-[18px] w-[18px]" />
            {moreTitle}
          </button>
        )}
      </nav>

      {hasMore && (
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent side="bottom" className="max-h-[70dvh] overflow-y-auto rounded-t-2xl p-0 pb-safe">
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-border" />
            <SheetHeader className="px-5 pt-3 text-left">
              <SheetTitle className="text-base">{moreTitle}</SheetTitle>
            </SheetHeader>
            <div className="px-3 pb-3 pt-1">
              {moreGroups!.map((group) => (
                <div key={group.label ?? group.items[0].to} className="mb-1 last:mb-0">
                  {group.label && (
                    <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                      {group.label}
                    </div>
                  )}
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={() => setMoreOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                          )
                        }
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
              {moreFooter && <div className="mt-3 border-t pt-3">{moreFooter}</div>}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
