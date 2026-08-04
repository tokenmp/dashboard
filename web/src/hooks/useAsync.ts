import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiError } from '@/utils/error';

/**
 * 一次性异步请求 Hook（详情/概览等非分页场景）。
 *
 * @param fn 返回数据的 Promise
 * @param deps 依赖项，变化时自动重新拉取
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(() => {
    setLoading(true);
    setError('');
    fnRef
      .current()
      .then(setData)
      .catch((e) => setError(getApiError(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fnRef
      .current()
      .then((d) => active && setData(d))
      .catch((e) => active && setError(getApiError(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload: run, setData };
}
