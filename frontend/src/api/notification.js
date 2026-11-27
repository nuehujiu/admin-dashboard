// 复用统一 axios 实例（自动携带 JWT、统一错误提示）
import request from './request';

/**
 * 拉取当前用户可见的通知列表
 * 后端会依据当前用户的角色/权限派生可见范围，前端不需要额外传过滤条件
 * @returns {Promise<object[]>} 通知数组（标题、内容、时间、类型等）
 */
export const getNotifications = () => request.get('/notifications'); // GET 通知集合，返回已按权限裁剪的数据
