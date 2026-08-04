import { createBrowserRouter, Navigate } from 'react-router-dom';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Requests from '@/pages/Requests';
import Users from '@/pages/Users';
import Account from '@/pages/Account';
import Upstream from '@/pages/Upstream';
import NotFound from '@/pages/NotFound';
import RequireAuth from '@/components/RequireAuth';
import Layout from '@/components/Layout';

/**
 * 路由配置
 *
 * - /login：公开
 * - / 及其子路由：经 RequireAuth 守卫 + Layout 布局
 *   · /        → 重定向到 /dashboard
 *   · /dashboard → Dashboard（登录后首页）
 */
export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'requests', element: <Requests /> },
      { path: 'users', element: <Users /> },
      { path: 'upstream', element: <Upstream /> },
      { path: 'account', element: <Account /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]);
