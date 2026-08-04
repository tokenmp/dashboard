import { createBrowserRouter } from 'react-router-dom';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import NotFound from '@/pages/NotFound';

/**
 * 路由配置
 *
 * 路由守卫（登录态校验）将在 feat/auth-integration 分支补齐。
 */
export const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/login', element: <Login /> },
  { path: '*', element: <NotFound /> },
]);
