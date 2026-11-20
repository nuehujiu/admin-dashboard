import { Navigate } from 'react-router-dom';
import { useUserStore } from '../store/useUserStore';
import { getDefaultMenuPath } from '../utils/permissions';

/**
 * 根路径的落点：按当前角色的菜单决定进哪一页
 * （游客类角色可能没有数据看板权限，不能再写死 /dashboard）
 */
export default function DefaultPage() {
  const menus = useUserStore((s) => s.menus);
  return <Navigate to={getDefaultMenuPath(menus)} replace />;
}
