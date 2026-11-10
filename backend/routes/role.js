/**
 * 角色管理路由（全部需鉴权）
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
const { authRequired } = require('../middleware/auth');

router.use(authRequired);

router.get('/', list);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);
router.get('/:id/menus', getMenus);
router.put('/:id/menus', assignMenus);

module.exports = router;
