import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * 认证页（登录/注册/找回密码）共用外壳：
 * 淡蓝渐变 + 两团柔光晕 + 细网格背景（.auth-grid 见 globals.css），
 * 品牌行（logo + 名称横排、标语小字注脚）居上，表单卡片居中。
 * 左上角「返回首页」链接（三张认证页共用）。
 *
 * 设计选型 2026-08-15：方案二「光晕渐变」；logo 用面板同款近黑版
 * （/tokenmp.svg），蓝色图标是 docs 站专属，不在此使用。
 * 刻意用固定色值而非主题变量：认证页不随深色模式切换。
 */
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-[#eff6ff] via-[#e0ecff] to-[#dbeafe] px-4 py-10">
      {/* 两团柔光晕 */}
      <div aria-hidden className="absolute -left-32 -top-40 h-[460px] w-[460px] rounded-full bg-blue-300/60 blur-[70px]" />
      <div aria-hidden className="absolute -bottom-56 -right-36 h-[520px] w-[520px] rounded-full bg-indigo-300/60 blur-[70px]" />
      {/* 细网格，径向遮罩向四周淡出 */}
      <div aria-hidden className="auth-grid absolute inset-0" />

      {/* 返回首页 */}
      <Link
        to="/"
        className="absolute left-4 top-5 z-10 flex items-center gap-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        返回首页
      </Link>

      <div className="relative z-10 w-full max-w-[400px]">
        {/* 品牌行：logo 与名称横排为一个视觉整体，标语降级为注脚 */}
        <div className="mb-6 flex flex-col items-center">
          <div className="flex items-center gap-[11px]">
            <img
              src="/tokenmp.svg"
              alt="TokenMP"
              className="h-[38px] w-[38px] drop-shadow-[0_4px_10px_rgba(15,23,42,0.18)]"
            />
            <span className="text-[21px] font-bold tracking-wide text-slate-900">TokenMP</span>
          </div>
          <div className="mt-2 text-xs tracking-[3px] text-slate-400">一颗 API KEY · 接入所有大模型</div>
        </div>
        {children}
      </div>
    </div>
  );
}

export default AuthShell;
