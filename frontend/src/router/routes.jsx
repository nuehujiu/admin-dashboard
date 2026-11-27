// 引入 Suspense：配合懒加载组件，在代码块下载期间展示占位内容
import { Suspense } from 'react';
// 引入登录页：属于首屏即可用的基础页面，直接静态引入
import Login from '../pages/Login';
// 引入 404 页：路由兜底，体量很小，同样静态引入
import NotFound from '../pages/NotFound';
// 引入路由守卫：统一处理登录态与权限拦截
import Guard from './guard';
// 引入默认落地页：访问 '/' 时按权限决定跳到哪个菜单
import DefaultPage from './DefaultPage';
// 引入懒加载包装后的布局与各业务页面，减少首屏体积
import { Layout, Dashboard, Sales, Goods, Users, Roles, Settings, Profile } from './lazyPages';
// 引入权限点常量，用于在路由 meta 上声明访问所需权限
import { PERM } from '../utils/permissions';

/**
 * 内容页全部懒加载：首屏只带 Layout + 登录页 + 404，
 * 其余页面在真正进入时按需下载（配合下面的 Suspense 与 Layout 内的 Suspense）
 */

// 导出集中式路由表，供 AppRoot 渲染与侧栏菜单推导使用
export const routes = [
  // 登录页：不参与侧栏菜单（meta.hidden），但仍是可访问路由
  { path: '/login', name: '登录', element: <Login />, meta: { hidden: true } },

  // 工作台根路由：包一层登录守卫，再包一层加载占位
  {
    // 父级路径，子路由都挂在这里
    path: '/',
    // 路由名（调试与菜单推导用）
    name: 'Layout',
    element: (
      // 先过登录态校验：未登录直接跳登录页
      <Guard>
        {/* 懒加载等待期间展示的占位视图 */}
        <Suspense
          fallback={
            <div
              style={{
                // 占满整屏高度，避免加载时页面抖动
                minHeight: '100vh',
                // grid + placeItems 实现水平垂直居中
                display: 'grid',
                placeItems: 'center',
                // 灰色小字，弱化等待感
                color: '#8a827b',
                fontSize: 13,
              }}
            >
              正在加载工作台…
            </div>
          }
        >
          {/* 侧边栏 + 内容区的外壳组件 */}
          <Layout />
        </Suspense>
      </Guard>
    ),
    // 子页面列表（同时用于生成侧栏菜单）
    children: [
      // index 路由：访问 '/' 本身时渲染默认落地页
      { index: true, element: <DefaultPage /> },

      // 数据看板
      {
        path: '/dashboard',
        name: '数据看板',
        element: <Dashboard />,
        meta: { icon: 'dashboard', permission: PERM.DASHBOARD_VIEW },
      },
      // 销售统计
      {
        path: '/sales',
        name: '销售统计',
        element: <Sales />,
        meta: { icon: 'bar-chart', permission: PERM.SALES_VIEW },
      },
      // 商品管理
      {
        path: '/goods',
        name: '商品管理',
        element: <Goods />,
        meta: { icon: 'shopping', permission: PERM.GOODS_VIEW },
      },
      // 用户管理（挂在 /system 分组下）
      {
        path: '/system/users',
        name: '用户管理',
        element: <Users />,
        meta: { icon: 'user', permission: PERM.USER_LIST },
      },
      // 角色管理（挂在 /system 分组下）
      {
        path: '/system/roles',
        name: '角色管理',
        element: <Roles />,
        meta: { icon: 'team', permission: PERM.ROLE_LIST },
      },
      // 系统设置
      {
        path: '/settings',
        name: '系统设置',
        element: <Settings />,
        meta: { icon: 'setting', permission: PERM.SETTINGS_VIEW },
      },
      // 个人中心：所有登录用户都应可访问
      {
        path: '/profile',
        name: '个人中心',
        element: <Profile />,
        meta: { icon: 'idcard', permission: PERM.PROFILE_VIEW },
      },
    ],
  },

  // 通配符兜底，必须最后一条，否则会抢先匹配其它路由
  { path: '*', name: '404', element: <NotFound />, meta: { hidden: true } },
];
