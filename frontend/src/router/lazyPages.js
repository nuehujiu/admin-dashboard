import { lazy } from 'react';

/**
 * 内容页的懒加载入口
 * 单独成文件：routes.jsx 只导出路由配置，不放组件声明，Fast Refresh 才不会被判违规
 */
// 外壳也懒加载：登录页首屏不必带上侧栏/顶栏那套 antd 组件
export const Layout = lazy(() => import('../layouts/Layout'));
export const Dashboard = lazy(() => import('../pages/Dashboard'));
export const Sales = lazy(() => import('../pages/Sales'));
export const Goods = lazy(() => import('../pages/Goods'));
export const Users = lazy(() => import('../pages/Users'));
export const Roles = lazy(() => import('../pages/Roles'));
export const Settings = lazy(() => import('../pages/Settings'));
export const Profile = lazy(() => import('../pages/Profile'));
