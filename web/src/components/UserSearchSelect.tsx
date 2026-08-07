import { useEffect, useRef, useState } from 'react';
import { SearchableSelect, type ComboOption } from '@/components/ui/searchable-select';
import { getDashboardUserDetailApi, getDashboardUsersApi } from '@/api/dashboard';

/**
 * 异步用户搜索选择器（用于按用户筛选）。
 * - 输入关键字后 debounce 调服务端搜索用户（不预加载全量）
 * - 清空关键字时恢复「全部用户」选项
 * - 已选用户在列表中不存在时（如刷新恢复）按 id 加载并显示
 */
export function UserSearchSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [opts, setOpts] = useState<ComboOption[]>([{ value: '', label: '全部用户' }]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 刷新恢复：value 非空但选项列表无此项时，加载该用户用于回显
  useEffect(() => {
    if (!value) return;
    if (opts.some((o) => o.value === value)) return;
    let alive = true;
    getDashboardUserDetailApi(value)
      .then((d) => {
        if (alive) setOpts((prev) => (prev.some((o) => o.value === d.user.id) ? prev : [...prev, { value: d.user.id, label: d.user.email }]));
      })
      .catch(() => { /* ignore */ });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleQuery = (q: string) => {
    window.clearTimeout(timer.current);
    const kw = q.trim();
    if (!kw) {
      setOpts([{ value: '', label: '全部用户' }]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await getDashboardUsersApi({ keyword: kw, page: 1, size: 20 });
        setOpts([
          { value: '', label: '全部用户' },
          ...res.list.map((u) => ({ value: u.id, label: u.email })),
        ]);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  return (
    <SearchableSelect
      options={opts}
      value={value}
      onChange={onChange}
      onQueryChange={handleQuery}
      loading={loading}
      placeholder="全部用户"
    />
  );
}
