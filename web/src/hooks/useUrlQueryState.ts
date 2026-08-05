import { useSearchParams } from 'react-router-dom';

export type UrlFieldSpec = {
  /** URL query 参数名，如 'q' */
  name: string;
  /** usePagedQuery params 对象的 key，如 'keyword' */
  key: string;
  /** number 类型会在读取时 Number() 转换 */
  type?: 'number' | 'string';
  /** 默认值；等于默认值（或空值）时不写入 URL，保持地址栏整洁 */
  default?: string | number;
};

/**
 * 列表筛选状态 ↔ URL query 桥接（刷新/分享链接后保持筛选）。
 *
 * - `initial`（挂载时读一次）：从 URL 解析成对象，展开进 usePagedQuery 的 initial
 * - `write(params)`：把当前 params 回写 URL（replace 模式，剔除默认值/空值）
 *
 * 用法：
 * ```ts
 * const { initial: urlInit, write } = useUrlQueryState([
 *   { name: 'q', key: 'keyword' },
 *   { name: 'status', key: 'status' },
 *   { name: 'page', key: 'page', type: 'number', default: 1 },
 *   { name: 'size', key: 'size', type: 'number', default: 20 },
 * ]);
 * const { params, ... } = usePagedQuery(fetcher, { initial: { size: 20, sort: '-created_at', ...urlInit } });
 * useEffect(() => { write(params); }, [params]);
 * ```
 *
 * 注：sort 等固定常量不入 URL；tab 状态可作为一个普通 string 字段纳入。
 */
export function useUrlQueryState(specs: UrlFieldSpec[]) {
  const [sp, setSp] = useSearchParams();

  const initial: Record<string, string | number> = {};
  for (const s of specs) {
    const raw = sp.get(s.name);
    if (raw === null || raw === '') continue;
    initial[s.key] = s.type === 'number' ? Number(raw) : raw;
  }

  const write = (params: object) => {
    const obj = params as Record<string, unknown>;
    const next = new URLSearchParams(sp);
    let changed = false;
    for (const s of specs) {
      const v = obj[s.key];
      const isDefault = v === undefined || v === null || v === '' || v === s.default;
      if (isDefault) {
        if (next.has(s.name)) {
          next.delete(s.name);
          changed = true;
        }
      } else {
        const sv = String(v);
        if (next.get(s.name) !== sv) {
          next.set(s.name, sv);
          changed = true;
        }
      }
    }
    if (changed) setSp(next, { replace: true });
  };

  return { initial, write };
}
