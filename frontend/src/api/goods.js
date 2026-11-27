// 复用统一 axios 实例：自动带 token、自动解包 { code, message, data }
import request from './request';

/**
 * 商品分页列表
 * @param {{ page?: number, pageSize?: number, keyword?: string, category?: string, status?: number }} params
 *        分页 + 关键字 + 分类 + 上下架状态筛选条件
 * @returns {Promise<{ list: object[], total: number }>} 当前页数据与总条数
 */
export const getGoods = (params = {}) => request.get('/goods', { params }); // axios 的 params 会拼成 query string

/**
 * 商品分类下拉选项
 * @returns {Promise<string[]>} 裸字符串数组，如 ['电子产品', '服饰鞋包']
 */
export const getGoodsCategories = () => request.get('/goods/categories'); // 供列表筛选与表单分类选择复用

/**
 * 商品详情
 * @param {number|string} id - 商品 ID（路径参数）
 * @returns {Promise<object>} 单个商品的完整字段
 */
export const getGoodsDetail = (id) => request.get(`/goods/${id}`); // 用模板串把 ID 拼进路径

/**
 * 新增商品
 * @param {object} data - 商品表单数据（名称、分类、价格、库存、描述等）
 * @returns {Promise<object>} 创建后的商品（通常含新 ID）
 */
export const createGoods = (data) => request.post('/goods', data); // POST 到集合资源

/**
 * 编辑商品（整字段更新）
 * @param {number|string} id - 目标商品 ID
 * @param {object} data - 最新字段值
 */
export const updateGoods = (id, data) => request.put(`/goods/${id}`, data); // PUT 语义为整体更新

/**
 * 单个商品上下架
 * @param {number|string} id - 商品 ID
 * @param {number} status - 1 上架 / 0 下架
 */
export const toggleGoodsStatus = (id, status) => request.put(`/goods/${id}/status`, { status }); // 只改状态字段，避免全量提交

/**
 * 删除单个商品
 * @param {number|string} id - 商品 ID
 */
export const deleteGoods = (id) => request.delete(`/goods/${id}`); // DELETE 集合下的单条资源

/**
 * 批量上下架
 * @param {Array<number|string>} ids - 需要变更的商品 ID 列表
 * @param {number} status - 1 上架 / 0 下架
 */
export const batchGoodsStatus = (ids, status) =>
  request.put('/goods/batch/status', { ids, status }); // 一次请求批量更新，减少往返

/**
 * 批量删除
 * @param {Array<number|string>} ids - 需要删除的商品 ID 数组
 * @returns {Promise<{ deleted: number }>} 实际删除条数
 */
export const batchDeleteGoods = (ids) => request.post('/goods/batch-delete', { ids }); // 用 POST 承载批量删除意图（避免超长 DELETE URL）
