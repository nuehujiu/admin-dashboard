/**
 * 认证路由
 *   POST /api/auth/register   注册
 *   POST /api/auth/login      登录，返回 token
 *   GET  /api/auth/me         获取当前登录用户信息（需鉴权）
 */
const express = require('express');
const router = express.Router();
const { register, login, me } = require('../controllers/authController');
const { authRequired } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/me', authRequired, me);

module.exports = router;
