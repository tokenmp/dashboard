import * as React from 'react';

interface MobilePageHeaderProps {
  title: React.ReactNode;
  /** 右侧主操作（如「新建密钥」按钮） */
  action?: React.ReactNode;
}

/** 移动端页头：页标题 + 右侧主操作。 */
export function MobilePageHeader({ title, action }: MobilePageHeaderProps) {
  return (
    <div className="flex items-center justify-between px-1 pt-1">
      <h1 className="text-sm font-bold">{title}</h1>
      {action}
    </div>
  );
}
