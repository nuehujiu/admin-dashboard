// 引入 React 的副作用与状态钩子
import { useEffect, useState } from 'react';
// 引入路由跳转组件与当前路由信息钩子
import { Navigate, useLocation } from 'react-router-dom';
// 引入加载指示器
import { Spin } from 'antd';
// 引入「获取当前用户资料」接口，返回 user + menus + permissions
import { getProfile } from '../api/auth';
// 引入「读取系统设置」接口，用于品牌名 / 主题色
import { getSettings } from '../api/settings';
// 引入 CSS 变量同步方法，使 SCSS 中的 var(--primary) 与主题色一致
import { applyCssVars } from '../utils/theme';
// 引入全局用户仓库
import { useUserStore } from '../store/useUserStore';
// 引入样式模块（全屏居中加载态）
import s from './guard.module.scss';

/**
 * Guard 路由守卫
 * 职责：校验登录态 → 拉取用户资料与系统设置 → 写入仓库 → 渲染子内容。
 * 只要 token 存在但资料拉取失败，就按未登录处理，防止无限 loading。
 */
export default function Guard({ children }) {
  // 取出「写入系统设置」方法
  const setSettings = useUserStore((state) => state.setSettings);
  // 获取当前路由信息（未登录跳转时需带回原路径）
  const location = useLocation();
  // 从仓库取 token，作为是否已登录的唯一判据
  const token = useUserStore((state) => state.token);
  // 取出「写入用户资料 / 菜单 / 权限」方法
  const setProfile = useUserStore((state) => state.setProfile);
  // 取出登出方法（资料拉取失败时清空登录态）
  const logout = useUserStore((state) => state.logout);
  // 资料是否已就绪；false 时展示 loading，避免渲染缺少权限数据的页面
  const [ready, setReady] = useState(false);

  // 依赖 token：登录后进入、token 变化时重新拉取资料
  useEffect(() => {
    // 无 token 直接跳过（下方渲染分支会重定向到登录页）
    if (!token) return;
    // 卸载标记：组件卸载后不再 setState，避免 React 警告与竞态覆盖
    let alive = true;

    // 并行拉取资料与设置，缩短首屏等待时间
    Promise.all([
      getProfile(),
      // 设置拉失败不该挡住登录，兜底成 null
      getSettings().catch(() => null),
    ])
      .then(([res, cfg]) => {
        // 已卸载则丢弃结果
        if (!alive) return;
        // 写入用户本身、菜单树、权限点（接口缺字段时兜底空数组，避免渲染报错）
        setProfile({
          user: res,
          menus: res.menus || [],
          permissions: res.permissions || [],
        });
        // 设置接口可用时：同步 CSS 变量并写入仓库
        if (cfg) {
          applyCssVars(cfg.themeColor);
          setSettings(cfg);
        }
        // 标记就绪，放行渲染
        setReady(true);
      })
      .catch((err) => {
        // 记录原因便于排查（后端未启动 / token 失效 / 权限接口异常）
        console.error('[guard] 拉取用户信息失败:', err);
        if (!alive) return;
        // 拉不到用户信息时按未登录处理并回登录页；
        // 否则 ready 一直是 false，页面会无限转圈
        logout();
      });

    // 清理函数：组件卸载时把存活标记置 false
    return () => {
      alive = false;
    };
  }, [token, setProfile, setSettings, logout]);

  // 未登录：重定向到登录页，并记录来源路径，登录成功后可直接跳回
  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // 已登录但资料未就绪：展示全屏加载动画
  if (!ready) {
    return (
      <div className={s.loading}>
        <Spin size="large" />
      </div>
    );
  }

  // 资料就绪：渲染被保护的子内容（即 Layout）
  return children;
}
