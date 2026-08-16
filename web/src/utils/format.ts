import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

/**
 * 紧凑数字：1234 -> 1.2K，2_665_581_235 -> 2.67B
 */
export function formatCompact(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return '—';
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(digits)}K`;
  return `${sign}${abs}`;
}

/**
 * 千分位完整数字
 */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US');
}

/**
 * 0~1 的小数转百分比字符串；null 返回 '—'
 */
export function formatPercent(rate: number | null | undefined, digits = 2): string {
  if (rate === null || rate === undefined) return '—';
  return `${(rate * 100).toFixed(digits)}%`;
}

/**
 * 将后端返回的时间字符串解析为用户本地时区的 dayjs 对象。
 * 后端 PG 会话时区为 Asia/Shanghai：不带时区后缀的 `YYYY-MM-DD HH:MM:SS`
 * 是北京时间墙钟值——须按 +08:00 解析（此前误按 UTC 解析导致展示偏移）。
 * 自带偏移（+08:00/Z 等）的字符串原样解析。
 */
function parseServerTime(s: string): dayjs.Dayjs {
  // 规范化：空格分隔改为 ISO 的 T；无时区后缀则按服务端会话时区（北京时间）补齐
  const iso = s.replace(' ', 'T') + (/[+-]\d{2}:?\d{2}$|Z$/.test(s) ? '' : '+08:00');
  return dayjs(iso).local();
}

/**
 * 日期时间格式化（自动按用户本地时区）：当天显示「今天 HH:MM:SS」，否则「YYYY-MM-DD HH:MM:SS」。
 * 输入为后端返回的 UTC 字符串（形如 `YYYY-MM-DD HH:MM:SS`）。
 */
export function formatDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  const d = parseServerTime(s);
  if (!d.isValid()) return '—';
  const now = dayjs();
  return d.isSame(now, 'day') ? `今天 ${d.format('HH:mm:ss')}` : d.format('YYYY-MM-DD HH:mm:ss');
}

/**
 * 纯日期格式化（YYYY-MM-DD，按本地时区）。
 */
export function formatDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = parseServerTime(s);
  return d.isValid() ? d.format('YYYY-MM-DD') : '—';
}
