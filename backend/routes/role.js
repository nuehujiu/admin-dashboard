/**
 * 角色管理路由（全部需鉴权 + 接口级权限）
 *   GET    /api/roles            角色列表
 *   POST   /api/roles            新增角色
 *   PUT    /api/roles/:id        编辑角色
 *   DELETE /api/roles/:id        删除角色
 *   GET    /api/roles/:id/menus  获取某角色的菜单权限
 *   PUT    /api/roles/:id/menus  分配菜单权限
 */
const express = require('express');
const router = express.Router();
const {
  list,
  create,
  update,
  remove,
  getMenus,
  assignMenus,
} = require('../controllers/roleController');
const { authRequired, requirePerm } = require('../middleware/auth');

router.use(authRequired);

// 列表接口放开给「有角色管理 或 有用户管理」的角色：
// 用户管理页的角色下拉也要调它
router.get('/', requirePerm('role:list', 'user:list'), list);
router.post('/', requirePerm('role:create'), create);
router.put('/:id', requirePerm('role:update'), update);
router.delete('/:id', requirePerm('role:delete'), remove);
router.get('/:id/menus', requirePerm('role:list'), getMenus);
router.put('/:id/menus', requirePerm('role:update'), assignMenus);

module.exports = router;
