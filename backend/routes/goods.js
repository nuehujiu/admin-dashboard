/**
 * 商品管理路由（全部需鉴权 + 接口级权限）
 *   GET    /api/goods                分页列表（keyword / category / status）
 *   GET    /api/goods/categories     分类选项（裸字符串数组）
 *   PUT    /api/goods/batch/status   批量上下架
 *   POST   /api/goods/batch-delete   批量删除
 *   GET    /api/goods/:id            商品详情
 *   POST   /api/goods                新增商品
 *   PUT    /api/goods/:id            编辑商品
 *   PUT    /api/goods/:id/status     上下架
 *   DELETE /api/goods/:id            删除商品
 */
// Express 路由工厂
const express = require('express');
const router = express.Router();
// 控制器方法
const {
  list, // 列表
  categories, // 分类
  batchStatus, // 批量上下架
  batchDelete, // 批量删除
  detail, // 详情
  create, // 新增
  update, // 编辑
  toggleStatus, // 单个上下架
  remove, // 删除
} = require('../controllers/goodsController');
// 鉴权 + 权限
const { authRequired, requirePerm } = require('../middleware/auth');

// 统一要求登录
router.use(authRequired);

// 注意：所有静态路径（categories / batch/status / batch-delete）
// 必须写在 /:id 之前，否则会被当成 id 去查详情
router.get('/', requirePerm('goods:view'), list);
router.get('/categories', requirePerm('goods:view'), categories);
router.put('/batch/status', requirePerm('goods:status'), batchStatus);
router.post('/batch-delete', requirePerm('goods:delete'), batchDelete);
router.get('/:id', requirePerm('goods:view'), detail);
router.post('/', requirePerm('goods:create'), create);
router.put('/:id', requirePerm('goods:update'), update);
// 上下架用独立的 goods:status 权限（和「编辑」分开授权）
router.put('/:id/status', requirePerm('goods:status'), toggleStatus);
router.delete('/:id', requirePerm('goods:delete'), remove);

// 导出路由
module.exports = router;
