import request from './request';

/** 商品分页列表（keyword / category / status） */
/**
 * 获取商品列表的API请求函数
 * @param {Object} params - 查询参数对象，默认为空对象
 * @returns {Promise} - 返回一个Promise对象，包含请求结果
 */
export const getGoods = (params = {}) => request.get('/goods', { params });

/** 分类下拉选项（裸字符串数组，如 ['电子产品','服饰鞋包']） */
/**
 * 获取商品分类列表的API请求函数
 * @returns {Promise} 返回一个Promise对象，包含商品分类列表的数据
 */
export const getGoodsCategories = () => request.get('/goods/categories');

/** 商品详情 */
/**
 * 获取商品详情的API请求函数
 * @param {number|string} id - 商品ID，可以是数字或字符串类型
 * @returns {Promise} - 返回一个Promise对象，包含请求的商品详情数据
 */
export const getGoodsDetail = (id) => request.get(`/goods/${id}`); // 使用request发送GET请求到指定商品ID的详情接口

/** 新增商品 */
/**
 * 创建商品
 * @param {Object} data - 商品数据对象
 * @returns {Promise} 返回一个Promise对象，包含请求结果
 */
export const createGoods = (data) => request.post('/goods', data); // 发送POST请求创建商品

/** 编辑商品 */
export const updateGoods = (id, data) => request.put(`/goods/${id}`, data);

/** 上下架：status 1 上架 / 0 下架 */
export const toggleGoodsStatus = (id, status) => request.put(`/goods/${id}/status`, { status });

/** 删除商品 */
export const deleteGoods = (id) => request.delete(`/goods/${id}`);

/** 批量上下架 */
export const batchGoodsStatus = (ids, status) =>
  request.put('/goods/batch/status', { ids, status });

/** 批量删除 */
/**
 * 批量删除商品的API请求函数
 * @param {Array} ids - 需要删除的商品ID数组
 * @returns {Promise} 返回一个Promise对象，包含请求的响应结果
 */
export const batchDeleteGoods = (ids) => request.post('/goods/batch-delete', { ids }); // 使用POST方法发送批量删除请求，请求路径为'/goods/batch-delete'，参数为包含商品ID的对象
