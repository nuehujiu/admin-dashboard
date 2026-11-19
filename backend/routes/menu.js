/**
 * 菜单/权限项路由（需鉴权）
 *   GET /api/menus  全量菜单与按钮权限
 */
const express = require('express');
const router = express.Router();
const { list } = require('../controllers/menuController');
const { authRequired } = require('../middleware/auth');

router.use(authRequired);

router.get('/', list);

module.exports = router;
