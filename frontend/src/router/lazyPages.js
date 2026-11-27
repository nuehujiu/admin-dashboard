// 引入 React 的 lazy 工厂，用于把组件拆成按需加载的独立 chunk
import { lazy } from 'react';

/**
 * 内容页的懒加载入口表
 * 为什么要单独成文件：
 * routes.jsx 只导出路由配置、不放组件声明，避免 Fast Refresh 把组件与配置混在一起判定为违规
 * 收益：每个页面打包成独立 chunk，首屏只下载当前命中的那一个
 */
// 外壳（侧栏 + 顶栏）也懒加载：登录页首屏不必带上这套 antd 组件
export const Layout = lazy(() => import('../layouts/Layout'));
// 数据看板页
export const Dashboard = lazy(() => import('../pages/Dashboard'));
// 销售统计页
export const Sales = lazy(() => import('../pages/Sales'));
// 商品管理页
export const Goods = lazy(() => import('../pages/Goods'));
// 用户管理页
export const Users = lazy(() => import('../pages/Users'));
// 角色管理页
export const Roles = lazy(() => import('../pages/Roles'));
// 系统设置页
export const Settings = lazy(() => import('../pages/Settings'));
// 个人中心页
export const Profile = lazy(() => import('../pages/Profile'));
