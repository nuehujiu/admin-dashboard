// 引入 Navigate：用于声明式重定向
import { Navigate } from 'react-router-dom';
// 引入用户仓库，读取当前用户的菜单列表
import { useUserStore } from '../store/useUserStore';
// 引入默认路径推导函数（取第一个真实可访问的菜单）
import { getDefaultMenuPath } from '../utils/permissions';

/**
 * 根路径 '/' 的落点页：按当前角色的菜单决定进入哪一页
 * 背景：不同角色可见菜单不同（如游客类角色可能没有数据看板权限），
 *      因此不能写死跳 /dashboard，否则会出现「跳到无权限页面」的情况
 */
export default function DefaultPage() {
  // 订阅菜单列表，登录后数据变更会触发重新计算
  const menus = useUserStore((s) => s.menus);
  // replace 模式重定向：不把 '/' 留在历史栈里，避免返回时来回弹跳
  return <Navigate to={getDefaultMenuPath(menus)} replace />;
}
