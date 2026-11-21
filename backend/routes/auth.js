/**
 * 认证路由
 *   POST /api/auth/register   注册（需登录 + 拥有 user:create 权限）
 *   POST /api/auth/login      登录，返回 token（限流）
 *   GET  /api/auth/me         获取当前登录用户信息（需鉴权）
 *   PUT  /api/auth/profile    修改个人资料（需鉴权）
 *   PUT  /api/auth/password   修改密码（需鉴权）
 *
 * 注册接口不再公开：后台系统不允许陌生人自建账号，
 * 需要开账号时由管理员在「用户管理」里加，或调本接口（带管理员 token）。
 */
const express = require('express');
const router = express.Router();
const {
  register,
  login,
  me,
  updateProfile,
  updatePassword,
} = require('../controllers/authController');
const { authRequired, requirePerm } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

// 个人中心的资料/密码接口只要求登录，不挂 requirePerm：
// operator 角色没有 profile:view 权限点，但它同样需要能改自己的密码
router.post('/register', authRequired, requirePerm('user:create'), register);
router.post('/login', loginLimiter, login);
router.get('/me', authRequired, me);
router.put('/profile', authRequired, updateProfile);
router.put('/password', authRequired, updatePassword);

module.exports = router;
