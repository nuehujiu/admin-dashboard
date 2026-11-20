/**
 * 菜单/权限项路由（需鉴权）
 *   GET /api/menus  全量菜单与按钮权限（角色权限矩阵用）
 */
const express = require('express');
const router = express.Router();
const { list } = require('../controllers/menuController');
const { authRequired, requirePerm } = require('../middleware/auth');

router.use(authRequired);

router.get('/', requirePerm('role:list', 'user:list'), list);

module.exports = router;
