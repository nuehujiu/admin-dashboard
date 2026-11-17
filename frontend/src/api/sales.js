import request from './request';

/**
 * 获取销售数据API接口函数
 * @param {Object} params - 查询参数对象，默认为空对象
 * @returns {Promise} - 返回一个Promise对象，包含服务器响应数据
 */
export const getSales = (params = {}) => request.get('/sales', { params });

export const getSalesStats = (days = 30) =>
  request.get('/sales/stats', { params: { days } });
