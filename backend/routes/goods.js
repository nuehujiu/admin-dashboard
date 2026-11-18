/**
 * 商品管理路由（全部需鉴权）
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
const express = require('express');
const router = express.Router();
const {
  list,
  categories,
  batchStatus,
  batchDelete,
  detail,
  create,
  update,
  toggleStatus,
  remove,
} = require('../controllers/goodsController');
const { authRequired } = require('../middleware/auth');

router.use(authRequired);

// 注意：所有静态路径（categories / batch/status / batch-delete）
// 必须写在 /:id 之前，否则会被当成 id 去查详情
router.get('/', list);
router.get('/categories', categories);
router.put('/batch/status', batchStatus);
router.post('/batch-delete', batchDelete);
router.get('/:id', detail);
router.post('/', create);
router.put('/:id', update);
router.put('/:id/status', toggleStatus);
router.delete('/:id', remove);

module.exports = router;
