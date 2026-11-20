/**
 * 通知路由
 *   GET /api/notifications  当前用户可见的通知列表（需鉴权）
 *   内容按角色权限派生，因此不挂 requirePerm
 */
const express = require('express');
const router = express.Router();
const { list } = require('../controllers/notificationController');
const { authRequired } = require('../middleware/auth');

router.get('/', authRequired, list);

module.exports = router;
