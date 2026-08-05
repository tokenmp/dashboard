import { createBrowserRouter } from 'react-router-dom';
import Login from '@/pages/login';
import NotFound from '@/pages/not-found';
import RoleHome from '@/components/RoleHome';
import RequireAuth from '@/components/RequireAuth';
import RequireRole from '@/components/RequireRole';
import Layout from '@/components/layout';
import PanelLayout from '@/components/panel-layout';

// 管理端页面（dashboard，admin，全平台）—— 调用 @/api/dashboard
import Dashboard from '@/pages/dashboard';
import Requests from '@/pages/requests';
import Users from '@/pages/users';
import Plans from '@/pages/plans';
import Upstream from '@/pages/upstream';
import Usage from '@/pages/usage';
import RedeemCodes from '@/pages/redeem-codes';
import Marketplace from '@/pages/marketplace';
import System from '@/pages/system';
import Releases from '@/pages/releases';

// 用户端页面（panel，自取数据）—— 调用 @/api/panel
import PanelOverview from '@/pages/panel/Overview';
import PanelRequests from '@/pages/panel/Requests';
import PanelUsage from '@/pages/panel/Usage';
import PanelKeys from '@/pages/panel/Keys';
import PanelRedemptions from '@/pages/panel/Redemptions';
import PanelNotices from '@/pages/panel/Notices';
import PanelReleases from '@/pages/panel/Releases';
import PanelAccount from '@/pages/panel/Account';

/**
 * 路由配置（按调用方彻底分离）
 *
 * - /login：公开登录页
 * - /：按角色重定向（admin→/dashboard，user→/panel）
 *
 * 管理端 /dashboard/*（RequireRole admin + Layout）：概览、请求、用户、上游、
 *   用量、兑换码、市场、系统、更新日志。全平台数据（@/api/dashboard）。
 *
 * 用户端 /panel/*（RequireAuth，任意已登录角色；admin 亦可）：概览、我的请求、
 *   我的用量、我的密钥、我的兑换、公告、更新日志、账户。自取数据（@/api/panel）——
 *   管理员在此同样只看自己。
 */
export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/', element: <RoleHome /> },

  // ── 管理端（admin）──
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
      { path: 'plans', element: <Plans /> },
      { path: 'upstream', element: <Upstream /> },
      { path: 'usage', element: <Usage /> },
      { path: 'redeem/codes', element: <RedeemCodes /> },
      { path: 'marketplace', element: <Marketplace /> },
      { path: 'system', element: <System /> },
      { path: 'releases', element: <Releases /> },
    ],
  },

  // ── 用户端（任意已登录角色；admin 亦可，以普通用户身份）──
  {
    path: '/panel',
    element: (
      <RequireAuth>
        <PanelLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <PanelOverview /> },
      { path: 'requests', element: <PanelRequests /> },
      { path: 'usage', element: <PanelUsage /> },
      { path: 'keys', element: <PanelKeys /> },
      { path: 'redemptions', element: <PanelRedemptions /> },
      { path: 'notices', element: <PanelNotices /> },
      { path: 'releases', element: <PanelReleases /> },
      { path: 'account', element: <PanelAccount /> },
    ],
  },

  { path: '*', element: <NotFound /> },
]);
