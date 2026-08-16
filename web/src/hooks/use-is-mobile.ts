import * as React from 'react';

/** 是否为移动端视口（<768px，与 Tailwind md 断点对齐）。随窗口尺寸变化实时更新。 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false,
  );

  React.useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
