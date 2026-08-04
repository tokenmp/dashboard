/**
 * 布局组件（占位）
 *
 * 真正的 Header + Sidebar 布局将在 feat/auth-integration 分支实现。
 */
function Layout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}

export default Layout;
