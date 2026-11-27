// 复用统一 axios 实例
import request from './request';

/**
 * 仪表盘概览指标
 * @returns {Promise<{ sales: number, orders: number, users: number, goods: number, growth?: object }>}
 *          顶部指标卡的汇总数据（含同比/环比增长等可选字段）
 */
export const getOverview = () => request.get('/dashboard/overview'); // 一次请求拿齐所有顶部指标，减少并发

/**
 * 趋势曲线数据
 * @param {number} days - 统计窗口天数，默认 30 天
 * @returns {Promise<{ dates: string[], sales: number[], orders: number[] }>} 时间轴与对应序列
 */
export const getTrend = (days = 30) =>
  request.get('/dashboard/trend', { params: { days } }); // 由后端按天聚合，前端不重复计算

/**
 * 分类占比数据（饼/环图）
 * @returns {Promise<Array<{ name: string, value: number }>>} 各分类名称与数值
 */
export const getCategoryRatio = () => request.get('/dashboard/category-ratio'); // 返回结构可直接喂给图表组件

/**
 * 排行榜数据
 * @param {number} top - 取前 N 名，默认 5
 * @returns {Promise<Array<{ name: string, value: number }>>} 排名列表
 */
export const getRank = (top = 5) =>
  request.get('/dashboard/rank', { params: { top } }); // top 由前端传入，后端做 limit
