/**
 * 角色管理路由（全部需鉴权 + 接口级权限）
 *   GET    /api/roles            角色列表
 *   POST   /api/roles            新增角色
 *   PUT    /api/roles/:id        编辑角色
 *   DELETE /api/roles/:id        删除角色
 *   GET    /api/roles/:id/menus  获取某角色的菜单权限
 *   PUT    /api/roles/:id/menus  分配菜单权限
 */
// Express 路由工厂
const express = require('express');
const router = express.Router();
// 控制器方法
const {
  list, // 列表
  create, // 新增
  update, // 编辑
  remove, // 删除
  getMenus, // 读权限
  assignMenus, // 写权限
} = require('../controllers/roleController');
// 鉴权 + 权限
const { authRequired, requirePerm } = require('../middleware/auth');

// 统一要求登录
router.use(authRequired);

// 列表接口放开给「有角色管理 或 有用户管理」的角色：
// 用户管理页的角色下拉也要调它
// 注意 requirePerm 是「任一满足」，所以这里传两个权限点即可
router.get('/', requirePerm('role:list', 'user:list'), list);
router.post('/', requirePerm('role:create'), create);
router.put('/:id', requirePerm('role:update'), update);
router.delete('/:id', requirePerm('role:delete'), remove);
// 读取某角色的权限 id（权限矩阵渲染用）
router.get('/:id/menus', requirePerm('role:list'), getMenus);
// 全量覆盖写入权限
router.put('/:id/menus', requirePerm('role:update'), assignMenus);

// 导出路由
module.exports = router;
