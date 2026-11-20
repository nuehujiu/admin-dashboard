/**
 * 用户管理路由（全部需鉴权 + 接口级权限）
 *   GET    /api/users                分页列表（keyword / role_id / status / sort）
 *   GET    /api/users/summary        概览：总数 / 本周新增 / 启用 / 禁用
 *   PUT    /api/users/batch/status   批量启用 / 禁用
 *   GET    /api/users/:id            用户详情
 *   POST   /api/users                新增用户
 *   PUT    /api/users/:id            编辑用户
 *   PUT    /api/users/:id/status     启停用户
 *   DELETE /api/users/:id            删除用户
 */
const express = require('express');
const router = express.Router();
const {
  list,
  summary,
  batchStatus,
  detail,
  create,
  update,
  toggleStatus,
  remove,
} = require('../controllers/userController');
const { authRequired, requirePerm } = require('../middleware/auth');

router.use(authRequired);

// 静态路径必须写在 /:id 之前，否则会被当成 id
router.get('/', requirePerm('user:list'), list);
router.get('/summary', requirePerm('user:list'), summary);
router.put('/batch/status', requirePerm('user:update'), batchStatus);
router.get('/:id', requirePerm('user:list'), detail);
router.post('/', requirePerm('user:create'), create);
router.put('/:id', requirePerm('user:update'), update);
router.put('/:id/status', requirePerm('user:update'), toggleStatus);
router.delete('/:id', requirePerm('user:delete'), remove);

module.exports = router;
