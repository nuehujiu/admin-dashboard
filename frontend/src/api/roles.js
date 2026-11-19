import request from './request';

/** 角色列表（含 status / user_count / menu_count） */
export const getRoles = () => request.get('/roles');

/** 全量菜单与按钮权限项 */
export const getMenus = () => request.get('/menus');

/** 某角色已拥有的 menu_id 数组 */
export const getRoleMenus = (id) => request.get(`/roles/${id}/menus`);

/** 全量覆盖写入某角色的权限 */
export const assignRoleMenus = (id, menuIds) => request.put(`/roles/${id}/menus`, { menu_ids: menuIds });

/** 新增角色：{ name, code, description } */
export const createRole = (data) => request.post('/roles', data);

/** 编辑角色 */
export const updateRole = (id, data) => request.put(`/roles/${id}`, data);

/** 删除角色（角色下有用户会被后端拒绝） */
export const deleteRole = (id) => request.delete(`/roles/${id}`);
