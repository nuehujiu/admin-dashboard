/**
 * 商品管理路由（全部需鉴权）
 *   GET    /api/goods              分页列表（keyword / category / status）
 *   GET    /api/goods/categories   分类选项（裸字符串数组）
 *   GET    /api/goods/:id          商品详情
 *   POST   /api/goods              新增商品
 *   PUT    /api/goods/:id          编辑商品
 *   PUT    /api/goods/:id/status   上下架
 *   DELETE /api/goods/:id          删除商品
 */
const express = require('express');
const router = express.Router();
const {
  list,
  categories,
  detail,
  create,
  update,
  toggleStatus,
  remove,
} = require('../controllers/goodsController');
const { authRequired } = require('../middleware/auth');

router.use(authRequired);

// 注意：/categories 必须写在 /:id 之前，否则会被当成 id
router.get('/', list);
router.get('/categories', categories);
router.get('/:id', detail);
router.post('/', create);
router.put('/:id', update);
router.put('/:id/status', toggleStatus);
router.delete('/:id', remove);

module.exports = router;
