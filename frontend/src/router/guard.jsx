import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { getProfile } from '../api/auth';
import { useUserStore } from '../store/useUserStore';
import s from './guard.module.scss';

/**
 * Guard组件 - 用于路由保护和用户权限验证
 * 检查用户是否已登录并获取用户信息，根据验证结果决定渲染内容
 */
export default function Guard({ children }) {
  // 获取当前路由信息
  const location = useLocation();
  // 从用户状态管理中获取token
  const token = useUserStore((state) => state.token);
  // 从用户状态管理中获取设置用户信息的方法
  const setProfile = useUserStore((state) => state.setProfile);
  // 获取退出登录方法
  const logout = useUserStore((state) => state.logout);
  // 用于控制组件是否准备就绪的状态
  const [ready, setReady] = useState(false);
  // 使用useEffect处理用户认证逻辑
  useEffect(() => {
    // 如果没有token，直接返回，不执行后续操作
    if (!token) return;
    // 设置一个标志位，用于在组件卸载时取消异步操作
    let alive = true;
    // 获取用户信息
    getProfile()
      .then((res) => {
        if (!alive) return;
        setProfile({
          user: res,
          menus: res.menus || [],
          permissions: res.permissions || [],
        });
        setReady(true);
      })
      .catch((err) => {
        console.error('[guard] 拉取用户信息失败:', err);
        if (!alive) return;
        // 拉不到用户信息（后端没启动 / token 失效）：按未登录处理，回登录页
        // 否则 ready 一直是 false，页面会无限转圈
        logout();
      });

    // 清理函数，在组件卸载时执行
    return () => {
      alive = false;
    };
  }, [token, setProfile, logout]);
  // 如果没有token，重定向到登录页面，并记录当前路径以便登录后跳回
  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  // 如果用户信息尚未加载完成，显示加载动画
  if (!ready) {
    return (
      <div className={s.loading}>
        <Spin size="large" />
      </div>
    );
  }
  // 如果已登录且用户信息已加载，渲染子组件
  return children;
}
