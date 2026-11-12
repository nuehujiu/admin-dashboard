import { Navigate } from 'react-router-dom';
import Layout from '../layouts/Layout';
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import Sales from '../pages/Sales';
import Goods from '../pages/Goods';
import Users from '../pages/Users';
import Roles from '../pages/Roles';
import Settings from '../pages/Settings';
import Profile from '../pages/Profile';
import NotFound from '../pages/NotFound';

export const routes = [
  { path: '/login', name: '登录', element: <Login />, meta: { hidden: true } },

  {
    path: '/',
    name: 'Layout',
    element: <Layout />,
    children: [
      // 默认页：访问 / 直接进看板
      { index: true, element: <Navigate to="/dashboard" replace /> },

      {
        path: '/dashboard',
        name: '数据看板',
        element: <Dashboard />,
        meta: { icon: 'dashboard' },
      },
      {
        path: '/sales',
        name: '销售统计',
        element: <Sales />,
        meta: { icon: 'bar-chart' },
      },
      {
        path: '/goods',
        name: '商品管理',
        element: <Goods />,
        meta: { icon: 'shopping' },
      },
      {
        path: '/system/users',
        name: '用户管理',
        element: <Users />,
        meta: { icon: 'user' },
      },
      {
        path: '/system/roles',
        name: '角色管理',
        element: <Roles />,
        meta: { icon: 'team' },
      },
      {
        path: '/settings',
        name: '系统设置',
        element: <Settings />,
        meta: { icon: 'setting' },
      },
      {
        path: '/profile',
        name: '个人中心',
        element: <Profile />,
        meta: { hidden: true },
      },
    ],
  },

  // 必须最后一条
  { path: '*', name: '404', element: <NotFound />, meta: { hidden: true } },
];
