import { createBrowserRouter } from 'react-router-dom';
import Login from '@/pages/Login';
import NotFound from '@/pages/NotFound';
import RoleHome from '@/components/RoleHome';
import RequireAuth from '@/components/RequireAuth';
import RequireRole from '@/components/RequireRole';
import Layout from '@/components/Layout';
import PanelLayout from '@/components/PanelLayout';

// 管理端页面（admin）
import Dashboard from '@/pages/Dashboard';
import Requests from '@/pages/Requests';
import Users from '@/pages/Users';
import Upstream from '@/pages/Upstream';
import Usage from '@/pages/Usage';
import RedeemCodes from '@/pages/RedeemCodes';
import Marketplace from '@/pages/Marketplace';
import System from '@/pages/System';
import Releases from '@/pages/Releases';
import Account from '@/pages/Account';

// 用户端页面（panel 专属）
import PanelKeys from '@/pages/panel/Keys';
import PanelNotices from '@/pages/panel/Notices';
// 用户端复用管理端组件（后端按角色自动 scope）
import MyRedemptions from '@/pages/MyRedemptions';

/**
 * 路由配置
 *
 * - /login：公开登录页
 * - /：按角色重定向（admin→/dashboard，user→/panel）
 *
 * 管理端 /dashboard/*（RequireRole admin）：
 *   /dashboard（概览）、requests、users、upstream、usage、redeem/codes、
 *   marketplace、system、releases、account
 *
 * 用户端 /panel/*（RequireAuth，任意已登录角色；admin 亦可访问）：
 *   /panel（概览）、requests、usage、keys、redemptions、notices、releases、account
 *   概览/请求/用量/兑换/账户/更新日志 复用管理端组件，后端按角色自动 scope。
 */
export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/', element: <RoleHome /> },

  // 管理端（admin）
  {
    path: '/dashboard',
    element: (
      <RequireRole role="admin">
        <Layout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'requests', element: <Requests /> },
      { path: 'users', element: <Users /> },
      { path: 'upstream', element: <Upstream /> },
      { path: 'usage', element: <Usage /> },
      { path: 'redeem/codes', element: <RedeemCodes /> },
      { path: 'marketplace', element: <Marketplace /> },
      { path: 'system', element: <System /> },
      { path: 'releases', element: <Releases /> },
      { path: 'account', element: <Account /> },
    ],
  },

  // 用户端（任意已登录角色）
  {
    path: '/panel',
    element: (
      <RequireAuth>
        <PanelLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'requests', element: <Requests /> },
      { path: 'usage', element: <Usage /> },
      { path: 'keys', element: <PanelKeys /> },
      { path: 'redemptions', element: <MyRedemptions /> },
      { path: 'notices', element: <PanelNotices /> },
      { path: 'releases', element: <Releases /> },
      { path: 'account', element: <Account /> },
    ],
  },

  { path: '*', element: <NotFound /> },
]);
