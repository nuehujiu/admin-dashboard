// 复用统一 axios 实例
import request from './request';

/**
 * 销售记录列表（支持分页与筛选）
 * @param {{ page?: number, pageSize?: number, keyword?: string, startDate?: string, endDate?: string }} params
 * @returns {Promise<{ list: object[], total: number }>} 列表数据与总数
 */
export const getSales = (params = {}) => request.get('/sales', { params }); // params 会序列化为查询参数

/**
 * 销售统计数据（用于顶部指标卡 / 趋势图）
 * @param {number} days - 统计窗口天数，默认 30 天
 * @returns {Promise<{ totalAmount: number, totalOrders: number, ... }>} 各汇总指标
 */
export const getSalesStats = (days = 30) =>
  request.get('/sales/stats', { params: { days } }); // 只传 days，后端按时间窗口聚合
