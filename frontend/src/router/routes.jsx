import { Suspense } from 'react';
import Login from '../pages/Login';
import NotFound from '../pages/NotFound';
import Guard from './guard';
import DefaultPage from './DefaultPage';
import { Layout, Dashboard, Sales, Goods, Users, Roles, Settings, Profile } from './lazyPages';
import { PERM } from '../utils/permissions';

/**
 * 内容页全部懒加载：首屏只带 Layout + 登录页 + 404，
 * 其余页面在真正进入时按需下载（配合 Layout 里的 Suspense）。
 */

export const routes = [
  { path: '/login', name: '登录', element: <Login />, meta: { hidden: true } },

  {
    path: '/',
    name: 'Layout',
    element: (
      <Guard>
        <Suspense
          fallback={
            <div
              style={{
                minHeight: '100vh',
                display: 'grid',
                placeItems: 'center',
                color: '#8a827b',
                fontSize: 13,
              }}
            >
              正在加载工作台…
            </div>
          }
        >
          <Layout />
        </Suspense>
      </Guard>
    ),
    children: [
      { index: true, element: <DefaultPage /> },

      {
        path: '/dashboard',
        name: '数据看板',
        element: <Dashboard />,
        meta: { icon: 'dashboard', permission: PERM.DASHBOARD_VIEW },
      },
      {
        path: '/sales',
        name: '销售统计',
        element: <Sales />,
        meta: { icon: 'bar-chart', permission: PERM.SALES_VIEW },
      },
      {
        path: '/goods',
        name: '商品管理',
        element: <Goods />,
        meta: { icon: 'shopping', permission: PERM.GOODS_VIEW },
      },
      {
        path: '/system/users',
        name: '用户管理',
        element: <Users />,
        meta: { icon: 'user', permission: PERM.USER_LIST },
      },
      {
        path: '/system/roles',
        name: '角色管理',
        element: <Roles />,
        meta: { icon: 'team', permission: PERM.ROLE_LIST },
      },
      {
        path: '/settings',
        name: '系统设置',
        element: <Settings />,
        meta: { icon: 'setting', permission: PERM.SETTINGS_VIEW },
      },
      {
        path: '/profile',
        name: '个人中心',
        element: <Profile />,
        meta: { icon: 'idcard', permission: PERM.PROFILE_VIEW },
      },
    ],
  },

  // 必须最后一条
  { path: '*', name: '404', element: <NotFound />, meta: { hidden: true } },
];
