import { useUserStore } from '../store/useUserStore';

export const PERM = {
  DASHBOARD_VIEW: 'dashboard:view',
  SALES_VIEW: 'sales:view',
  GOODS_VIEW: 'goods:view',
  GOODS_CREATE: 'goods:create',
  GOODS_UPDATE: 'goods:update',
  GOODS_DELETE: 'goods:delete',
  GOODS_STATUS: 'goods:status',
  GOODS_STOCK: 'goods:stock',
  USER_LIST: 'user:list',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  ROLE_LIST: 'role:list',
  ROLE_CREATE: 'role:create',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',
  SETTINGS_VIEW: 'settings:view',
  PROFILE_VIEW: 'profile:view',
};

export function usePermission() {
  const permissions = useUserStore((s) => s.permissions) ?? [];
  const menus = useUserStore((s) => s.menus) ?? [];
  const can = (perm) => {
    if (!perm) return true;
    if (Array.isArray(perm)) return perm.some((p) => permissions.includes(p));
    return permissions.includes(perm);
  };
  const canAll = (list) => list.every((p) => permissions.includes(p));
  const hasMenu = (path) => menus.some((m) => m.path === path);
  return { can, canAll, hasMenu, permissions, menus };
}

export function getDefaultMenuPath(menus){
    const GROUPS=['/system']
    const first=(menus||[]).find(
        (m)=>m.type===1&&m.path&&m.path.startsWith('/')&&!GROUPS.includes(m.path)
    )
    return first?.path||'/profile'
}