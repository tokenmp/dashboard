import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { homePathFor } from '@/utils/redirect';
import { useRole } from '@/hooks/useRole';

const NAV_ITEMS = [
  { to: '/features', label: '功能特性' },
  { to: '/models', label: '模型广场' },
  { to: '/plans', label: '套餐' },
  { to: '/faq', label: '常见问题' },
];

/**
 * 路由滚动管理：React Router 切换路由不会自动滚动。
 * - 带锚点（如 /faq#billing）→ 平滑滚到对应元素（scroll-mt 已留出吸顶导航高度）
 * - 无锚点 → 回到顶部
 */
function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}

/**
 * Landing 公开页布局：顶部导航（各子页为独立路由页）+ 内容 + 页脚。
 *
 * - 未登录：右侧展示「登录 / 免费注册」（/register）；
 * - 已登录：右侧展示「进入控制台」（按角色直达 panel / dashboard）。

 */
export default function LandingLayout() {
  const token = useAuthStore((s) => s.token);
  const { user } = useRole();

  return (
    <div className="min-h-screen bg-white text-zinc-800 antialiased">
      <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/75 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white">
              T
            </span>
            <span className="text-[17px] font-semibold tracking-tight">TokenMP</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-zinc-500 md:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? 'font-medium text-zinc-900' : 'transition hover:text-zinc-900'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            {token ? (
              <Link
                to={user ? homePathFor(user.role) : '/panel'}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
              >
                进入控制台
              </Link>
            ) : (
              <>
                <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-900">
                  登录
                </Link>
                <Link
                  to="/register"
                  className="ml-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
                >
                  免费注册
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <ScrollManager />
      <Outlet />

      <footer className="border-t border-zinc-100">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-xs font-bold text-white">T</span>
              <span className="font-semibold text-zinc-900">TokenMP</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-zinc-500">AI 模型统一网关，用得起、看得清。</p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">产品</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-500">
              <li><Link to="/features" className="transition hover:text-zinc-900">功能特性</Link></li>
              <li><Link to="/models" className="transition hover:text-zinc-900">模型广场</Link></li>
              <li><Link to="/plans" className="transition hover:text-zinc-900">套餐</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">支持</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-500">
              <li><Link to="/faq" className="transition hover:text-zinc-900">常见问题</Link></li>
              <li><Link to="/login" className="transition hover:text-zinc-900">控制台</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">账号</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-500">
              <li><Link to="/login" className="transition hover:text-zinc-900">登录</Link></li>
              <li><Link to="/register" className="transition hover:text-zinc-900">注册</Link></li>
              <li><Link to="/forgot-password" className="transition hover:text-zinc-900">找回密码</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-zinc-100 py-6 text-center text-xs text-zinc-400">© 2026 TokenMP · All rights reserved</div>
      </footer>
    </div>
  );
}
