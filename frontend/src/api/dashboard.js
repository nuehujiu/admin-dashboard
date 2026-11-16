import request from './request';

/**
 * 获取仪表盘概览数据
 * 该函数通过GET请求获取仪表盘的概览信息
 * @returns {Promise} 返回一个Promise对象，包含请求的响应数据
 */
export const getOverview = () => request.get('/dashboard/overview');

/**
 * 获取趋势数据的API请求函数
 * @param {number} days - 获取趋势数据的天数，默认为30天
 * @returns {Promise} - 返回一个Promise对象，包含API请求的响应数据
 */
export const getTrend = (days = 30) =>
  request.get('/dashboard/trend', { params: { days } });

/**
 * 获取分类占比数据
 * 该函数用于向服务器请求仪表盘中的分类比例数据
 * @returns {Promise} 返回一个Promise对象，包含服务器响应的分类比例数据
 */
export const getCategoryRatio = () => request.get('/dashboard/category-ratio');

/**
 * 获取排名数据
 * @param {number} top - 获取前多少名的数据，默认为5
 * @returns {Promise} - 返回一个Promise对象，包含请求的响应数据
 */
export const getRank = (top = 5) =>
  request.get('/dashboard/rank', { params: { top } });
