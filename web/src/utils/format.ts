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
