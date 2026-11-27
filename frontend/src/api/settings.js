// 复用统一 axios 实例
import request from './request';

/**
 * 读取系统设置（品牌名、logo、主题色、公告等）
 * @returns {Promise<object>} 设置键值对象，登录页品牌展示也依赖这里返回的站点名
 */
export const getSettings = () => request.get('/settings'); // 公开或带登录态均可调用，取决于后端路由配置

/**
 * 保存系统设置（部分更新）
 * @param {object} data - 需要变更的设置项键值对
 * @returns {Promise<object>} 保存后的完整设置，便于前端立即回填
 */
export const saveSettings = (data) => request.put('/settings', data); // PUT 语义：提交的字段覆盖旧值

/**
 * 恢复默认设置
 * @returns {Promise<object>} 重置后的默认设置
 */
export const resetSettings = () => request.post('/settings/reset'); // 用 POST 表达「执行一次动作」而非资源更新
