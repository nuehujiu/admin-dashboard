// 复用统一 axios 实例：统一鉴权头与响应解包
import request from './request';

/**
 * 角色列表
 * @returns {Promise<object[]>} 每个角色含 status（启用状态）、user_count（关联用户数）、menu_count（权限项数）
 */
export const getRoles = () => request.get('/roles'); // 一次取回角色及其统计字段，供列表直接渲染

/**
 * 全量菜单与按钮权限项（树形来源数据）
 * @returns {Promise<object[]>} 菜单项数组，含 id / parent_id / type（菜单或按钮）/ name / path 等
 */
export const getMenus = () => request.get('/menus'); // 授权弹窗与角色权限树都基于这份全量数据

/**
 * 查询某角色已拥有的权限项
 * @param {number|string} id - 角色 ID
 * @returns {Promise<number[]>} menu_id 数组，可直接回填到菜单树 checkedKeys
 */
export const getRoleMenus = (id) => request.get(`/roles/${id}/menus`); // 路径参数定位角色

/**
 * 全量覆盖写入某角色的权限（先删后插，语义为「最终态」而非增量）
 * @param {number|string} id - 角色 ID
 * @param {number[]} menuIds - 保存后该角色应拥有的全部 menu_id
 */
export const assignRoleMenus = (id, menuIds) =>
  request.put(`/roles/${id}/menus`, { menu_ids: menuIds }); // 字段名用蛇形 menu_ids，与后端保持一致

/**
 * 新增角色
 * @param {{ name: string, code: string, description?: string }} data
 *        name 展示名；code 业务唯一标识（权限串前缀）；description 备注
 */
export const createRole = (data) => request.post('/roles', data); // 后端会校验 code 唯一性

/**
 * 编辑角色（改名 / 改描述 / 启停）
 * @param {number|string} id - 角色 ID
 * @param {object} data - 需要更新的字段
 */
export const updateRole = (id, data) => request.put(`/roles/${id}`, data); // 部分字段更新，未传字段保持原值

/**
 * 删除角色
 * @param {number|string} id - 角色 ID
 * 注意：该角色下仍有关联用户时，后端会拒绝删除并返回业务错误
 */
export const deleteRole = (id) => request.delete(`/roles/${id}`); // 删除前建议前端先做 user_count > 0 的预判
