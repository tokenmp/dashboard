import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageQuery, PageResult } from '@/types/common';
import { getApiError } from '@/utils/error';

type Fetcher<T> = (params: PageQuery) => Promise<PageResult<T>>;

interface Options<Q extends PageQuery> {
  /** 初始查询参数（含 page/size/筛选） */
  initial?: Q;
  /** 是否在挂载时自动拉取，默认 true */
  immediate?: boolean;
}

interface State<T, Q extends PageQuery> {
  list: T[];
  total: number;
  page: number;
  size: number;
  loading: boolean;
  error: string;
  params: Q;
}

/**
 * 通用分页查询 Hook：管理 列表/分页/筛选/loading/error，支持刷新与重置。
 *
 * @param fetcher 返回 PageResult<T> 的请求函数
 */
export function usePagedQuery<T, Q extends PageQuery = PageQuery>(
  fetcher: Fetcher<T>,
  options: Options<Q> = {},
) {
  const { initial, immediate = true } = options;
  const initialParams = {
    page: 1,
    size: 20,
    ...(initial ?? {}),
  } as Q;

  const [state, setState] = useState<State<T, Q>>({
    list: [],
    total: 0,
    page: initialParams.page ?? 1,
    size: initialParams.size ?? 20,
    loading: false,
    error: '',
    params: initialParams,
  });

  const fetchingRef = useRef(false);
  const mountedRef = useRef(true);

  const load = useCallback(
    async (override?: Partial<Q>) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      const params = { ...state.params, ...override } as Q;
      setState((s) => ({ ...s, loading: true, error: '', params }));
      try {
        const res = await fetcher(params);
        if (!mountedRef.current) return;
        setState((s) => ({
          ...s,
          list: res.list,
          total: res.total,
          page: res.page,
          size: res.size,
          loading: false,
        }));
      } catch (e) {
        if (!mountedRef.current) return;
        setState((s) => ({ ...s, loading: false, error: getApiError(e) }));
      } finally {
        fetchingRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetcher],
  );

  // 重新加载（保持当前 page/筛选）
  const reload = useCallback(() => load(), [load]);

  // 跳转到指定页
  const setPage = useCallback(
    (page: number) => load({ page } as Partial<Q>),
    [load],
  );

  // 改变每页条数（回到第 1 页）
  const setSize = useCallback(
    (size: number) => load({ size, page: 1 } as Partial<Q>),
    [load],
  );

  // 更新筛选条件并回到第 1 页
  const setFilters = useCallback(
    (filters: Partial<Omit<Q, 'page' | 'size'>>) =>
      load({ ...(filters as Partial<Q>), page: 1 } as Partial<Q>),
    [load],
  );

  // 重置为初始参数
  const reset = useCallback(() => load({ ...initialParams } as Partial<Q>), [load, initialParams]);

  useEffect(() => {
    mountedRef.current = true;
    if (immediate) load();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    list: state.list,
    total: state.total,
    page: state.page,
    size: state.size,
    loading: state.loading,
    error: state.error,
    params: state.params,
    reload,
    setPage,
    setSize,
    setFilters,
    reset,
  };
}
