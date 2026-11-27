// 引入用户状态仓库：权限点与菜单都在登录 / 拉取资料时写入
import { useUserStore } from '../store/useUserStore';

/**
 * 全项目权限点常量表
 * 作用：把散落在各页面的权限字符串集中定义，避免手写错拼；
 * 命名约定为「资源:动作」，与后端菜单表里的 permission 字段一一对应
 */
export const PERM = {
  // 仪表盘查看
  DASHBOARD_VIEW: 'dashboard:view',
  // 销售数据查看
  SALES_VIEW: 'sales:view',
  // 商品列表查看
  GOODS_VIEW: 'goods:view',
  // 新建商品
  GOODS_CREATE: 'goods:create',
  // 编辑商品
  GOODS_UPDATE: 'goods:update',
  // 删除商品
  GOODS_DELETE: 'goods:delete',
  // 上下架切换
  GOODS_STATUS: 'goods:status',
  // 库存调整（若后端启用）
  GOODS_STOCK: 'goods:stock',
  // 用户列表查看
  USER_LIST: 'user:list',
  // 新建用户
  USER_CREATE: 'user:create',
  // 编辑用户
  USER_UPDATE: 'user:update',
  // 删除用户
  USER_DELETE: 'user:delete',
  // 角色列表查看
  ROLE_LIST: 'role:list',
  // 新建角色
  ROLE_CREATE: 'role:create',
  // 编辑角色 / 分配权限
  ROLE_UPDATE: 'role:update',
  // 删除角色
  ROLE_DELETE: 'role:delete',
  // 系统设置查看
  SETTINGS_VIEW: 'settings:view',
  // 系统设置修改
  SETTINGS_UPDATE: 'settings:update',
  // 个人中心查看
  PROFILE_VIEW: 'profile:view',
};

/**
 * 权限判断 Hook（组件内使用）
 * 所有判断都基于 store 中缓存的当前用户权限点，不做额外请求
 * @returns {{ can: Function, canAll: Function, hasMenu: Function, permissions: string[], menus: object[] }}
 */
export function usePermission() {
  // 订阅权限点数组；用 ?? [] 兜底未登录 / 数据未加载的情况，避免 undefined 报错
  const permissions = useUserStore((s) => s.permissions) ?? [];
  // 订阅可见菜单（用于判断某个路由是否对当前用户开放）
  const menus = useUserStore((s) => s.menus) ?? [];

  /**
   * 判断是否拥有某个权限
   * @param {string|string[]} perm - 单个权限码，或权限码数组
   * @returns {boolean} 传空表示「无需权限」直接放行；
   *                    传数组时为「任一满足」(some)，与后端 requirePerm 语义一致
   */
  const can = (perm) => {
    // 未传权限点：视为公开能力，直接允许
    if (!perm) return true;
    // 数组形态：满足任意一个即可
    if (Array.isArray(perm)) return perm.some((p) => permissions.includes(p));
    // 单值形态：精确匹配
    return permissions.includes(perm);
  };

  /**
   * 判断是否同时拥有全部权限（用于必须全满足的组合场景）
   * @param {string[]} list - 权限码数组
   * @returns {boolean} 全部命中才为 true
   */
  const canAll = (list) => list.every((p) => permissions.includes(p));

  /**
   * 判断当前用户的菜单里是否包含某个路由路径
   * @param {string} path - 路由 path，如 '/goods'
   * @returns {boolean} 有该菜单才允许访问对应页面
   */
  const hasMenu = (path) => menus.some((m) => m.path === path);

  // 一次性返回判断函数与原始数据，便于调用方按需使用
  return { can, canAll, hasMenu, permissions, menus };
}

/**
 * 计算登录后 / 无权限时默认跳转的菜单路径
 * 规则：跳过分组节点（type !== 1）与 '/system' 这类只做容器的路径，
 *      取第一个真实可访问的页面；都取不到时落到个人中心
 * @param {object[]} menus - 用户菜单列表
 * @returns {string} 默认路由 path
 */
export function getDefaultMenuPath(menus){
    // 仅作为容器、不适合直接落地访问的路径
    const GROUPS=['/system']
    // 找到第一个「菜单节点 + 有路径 + 以 / 开头 + 不是容器分组」的项
    const first=(menus||[]).find(
        (m)=>m.type===1&&m.path&&m.path.startsWith('/')&&!GROUPS.includes(m.path)
    )
    // 命中则用其 path，否则兜底个人中心
    return first?.path||'/profile'
}
