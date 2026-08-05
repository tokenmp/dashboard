import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getApiError } from '@/utils/error';

interface MutateOptions<T> {
  /** 成功后回调（如关闭弹窗、刷新列表） */
  onSuccess?: (result: T) => void;
  /** 成功提示文案；为空则不弹成功 toast */
  successMsg?: string;
  /** 失败提示前缀，默认空 */
  errorMsg?: string;
}

/**
 * 写操作 hook：统一封装 loading 状态 + 成功/失败 toast。
 *
 * 用法：
 *   const { loading, mutate } = useMutation();
 *   await mutate(() => createNoticeApi(body), { successMsg: '已创建', onSuccess: () => reload() });
 *
 * 失败时弹 toast.error 并 re-throw，调用方可据 catch 决定是否关闭弹窗（通常保持弹窗让用户重试）。
 */
export function useMutation() {
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const mutate = useCallback(async <T,>(fn: () => Promise<T>, opts?: MutateOptions<T>): Promise<T> => {
    setLoading(true);
    try {
      const result = await fn();
      if (mounted.current) {
        if (opts?.successMsg) toast.success(opts.successMsg);
        opts?.onSuccess?.(result);
      }
      return result;
    } catch (e) {
      const msg = getApiError(e);
      if (mounted.current) {
        toast.error(opts?.errorMsg ? `${opts.errorMsg}：${msg}` : msg);
      }
      throw e;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  return { loading, mutate };
}
