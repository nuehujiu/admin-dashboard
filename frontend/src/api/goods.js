import request from './request';

/** 商品分页列表（keyword / category / status） */
export const getGoods = (params = {}) => request.get('/goods', { params });

/** 分类下拉选项（裸字符串数组，如 ['电子产品','服饰鞋包']） */
export const getGoodsCategories = () => request.get('/goods/categories');

/** 商品详情 */
export const getGoodsDetail = (id) => request.get(`/goods/${id}`);

/** 新增商品 */
export const createGoods = (data) => request.post('/goods', data);

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
export const batchDeleteGoods = (ids) => request.post('/goods/batch-delete', { ids });
