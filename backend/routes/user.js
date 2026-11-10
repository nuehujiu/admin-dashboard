/**
 * 用户管理路由（全部需鉴权）
 *   GET    /api/users              分页列表（支持关键词 / 角色 / 状态筛选）
 *   GET    /api/users/:id          用户详情
 *   POST   /api/users              新增用户
 *   PUT    /api/users/:id          编辑用户
 *   PUT    /api/users/:id/status   启停用户
 *   DELETE /api/users/:id          删除用户
 */
const express = require('express');
const router = express.Router();
const {
  list,
  detail,
  create,
  update,
  toggleStatus,
  remove,
} = require('../controllers/userController');
const { authRequired } = require('../middleware/auth');

router.use(authRequired);

router.get('/', list);
router.get('/:id', detail);
router.post('/', create);
router.put('/:id', update);
router.put('/:id/status', toggleStatus);
router.delete('/:id', remove);

module.exports = router;
