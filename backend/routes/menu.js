/**
 * 菜单/权限项路由（需鉴权）
 *   GET /api/menus  全量菜单与按钮权限（角色权限矩阵用）
 */
// Express 路由工厂
const express = require('express');
const router = express.Router();
// 控制器：只读列表
const { list } = require('../controllers/menuController');
// 鉴权 + 权限
const { authRequired, requirePerm } = require('../middleware/auth');

// 统一要求登录
router.use(authRequired);

// 读到全量菜单：角色管理（权限矩阵）与用户管理（角色下拉）都要用
router.get('/', requirePerm('role:list', 'user:list'), list);

// 导出路由
module.exports = router;
