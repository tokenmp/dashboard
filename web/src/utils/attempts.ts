import type { RequestAttemptItem } from '@/types/request-log';

/**
 * 按时间排序后推断每个 attempt 所属的重试「轮次」。
 *
 * executor 的 attempt_index 是「轮内 route 序号」，每轮从 1 重新计数；
 * 当一次请求所有上游 key 都失败后，fallback 决策会再来一轮，index 回到 1。
 * 因此按 created_at 排序后，遇到 attempt_index 回退（<= 前一个）即视为进入新一轮。
 *
 * 返回值附带 pass（轮次，从 1 开始），用于显示 `#轮次-轮内序号`。
 */
export function withAttemptPasses(
  attempts: RequestAttemptItem[],
): Array<RequestAttemptItem & { pass: number }> {
  const sorted = [...attempts].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  let pass = 0;
  let prevIndex = Number.MAX_SAFE_INTEGER;
  return sorted.map((a) => {
    const idx = a.attempt_index ?? 0;
    if (idx <= prevIndex) pass += 1;
    prevIndex = idx;
    return { ...a, pass };
  });
}
