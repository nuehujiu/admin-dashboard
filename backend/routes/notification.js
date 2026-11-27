/**
 * 通知路由
 *   GET /api/notifications  当前用户可见的通知列表（需鉴权）
 *   内容按角色权限派生，因此不挂 requirePerm
 */
// Express 路由工厂
const express = require('express');
const router = express.Router();
// 控制器：通知列表
const { list } = require('../controllers/notificationController');
// 只需登录态
const { authRequired } = require('../middleware/auth');

// 通知内容取决于角色能看到哪些数据，所以不额外要求权限点
router.get('/', authRequired, list);

// 导出路由
module.exports = router;
