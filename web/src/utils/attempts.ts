import type { RequestAttemptItem } from '@/types/request-log';

/** attempt.error_code 的简短中文标签（用于表格，控制在 4-5 字）。 */
const ATTEMPT_ERROR_LABELS: Record<string, string> = {
  UPSTREAM_OVERLOADED: '上游繁忙',
  UPSTREAM_QUOTA_EXCEEDED: '额度不足',
  UPSTREAM_RATE_LIMITED: '限流',
  UPSTREAM_INTERNAL_ERROR: '上游异常',
  UPSTREAM_PERMISSION_DENIED: '权限不足',
  UPSTREAM_INVALID_REQUEST: '请求无效',
  UPSTREAM_AUTH_INVALID: '鉴权失败',
  UPSTREAM_MODEL_NOT_SUPPORTED: '模型不支持',
  UPSTREAM_ERROR: '上游异常',
  UPSTREAM_CONTEXT_LENGTH_EXCEEDED: '超长限制',
  CLIENT_CANCELED: '客户端取消',
  UPSTREAM_TIMEOUT: '上游超时',
  UPSTREAM_CONTENT_BLOCKED: '内容拦截',
};

/** 返回 error_code 的简短中文标签；未知 code 回退显示原始值。 */
export function attemptErrorLabel(code: string | null): string | null {
  if (!code) return null;
  return ATTEMPT_ERROR_LABELS[code] ?? code;
}

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
