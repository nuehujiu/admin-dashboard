// 复用统一 axios 实例（自动带 token、统一错误提示）
import request from "./request";

/**
 * 用户列表（分页 + 筛选）
 * @param {{ page?: number, pageSize?: number, keyword?: string, status?: number, role_id?: number }} params
 * @returns {Promise<{ list: object[], total: number }>} 列表与总数
 */
export const getUsers=(params={})=>{
    // 以 query 参数形式把分页/筛选条件发给后端
    return request.get('/users',{params})
}

/**
 * 用户统计汇总（用于列表顶部的统计卡）
 * @returns {Promise<{ total: number, active: number, disabled: number, ... }>} 各状态人数
 */
export const getUsersSummary=()=>{
    // 独立接口，避免前端遍历全量列表自行统计
    return request.get('/users/summary')
}

/**
 * 新增用户
 * @param {object} data - 用户名/昵称/角色/手机号/邮箱/初始密码等
 * @returns {Promise<object>} 创建结果（通常返回新用户信息）
 */
export const createUser=(data)=>{
    // POST 集合资源，后端会校验用户名唯一并加密密码
    return request.post('/users',data)
}

/**
 * 编辑用户
 * @param {number|string} id - 目标用户 ID
 * @param {object} data - 需要更新的字段（如昵称、角色、联系方式）
 */
export const updateUser=(id,data)=>{
    // PUT 到具体资源，后端按字段做部分更新
    return request.put(`/users/${id}`,data)
}

/**
 * 启用 / 禁用用户
 * @param {number|string} id - 用户 ID
 * @param {number} status - 1 启用 / 0 禁用
 */
export const toggleUserStatus=(id,status)=>{
    // 只提交 status，避免整行数据被覆盖
    return request.put(`/users/${id}/status`,{status})
}

/**
 * 删除单个用户
 * @param {number|string} id - 用户 ID
 */
export const deleteUser=(id)=>{
    // DELETE 单条资源，后端通常会校验是否为超管等保护条件
    return request.delete(`/users/${id}`)
}

/**
 * 批量变更用户状态
 * @param {Array<number|string>} ids - 目标用户 ID 列表
 * @param {*} data - 状态载荷（当前实现原样透传给后端，字段由后端解析）
 * @returns {Promise<object>} 批量处理结果
 */
export const batchUserStatus=(ids,data)=>{
    // 请求体保持 { ids, data } 的既有约定，后端据此批量更新
    return request.put('/users/batch/status',{ids,data})
}

/**
 * 角色下拉数据（表单分配角色时使用）
 * @returns {Promise<object[]>} 角色列表（含 id / name / code）
 */
export const getRoles=()=>{
    // 与 roles.js 中的 getRoles 走同一接口，这里为避免循环依赖/方便使用者就近调用
    return request.get('/roles')
}
