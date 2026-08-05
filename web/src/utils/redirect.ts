const DEFAULT_REDIRECT = '/dashboard';

/**
 * 从 redirect 参数解析安全的站内跳转地址。
 *
 * 防止开放重定向攻击：只允许以单个 `/` 开头的相对路径，
 * 且不允许跳回 /login 自身（否则登录后陷入死循环）。
 */
export function safeRedirect(redirect: string | null | undefined): string {
  if (!redirect) return DEFAULT_REDIRECT;
  if (redirect === '/login') return DEFAULT_REDIRECT;
  if (redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect;
  }
  return DEFAULT_REDIRECT;
}

/**
 * 角色首页：admin → /dashboard（管理端），其余 → /panel（用户端）。
 */
export function homePathFor(role?: string | null): string {
  return role === 'admin' ? '/dashboard' : '/panel';
}
