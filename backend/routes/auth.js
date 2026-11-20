/**
 * 认证路由
 *   POST /api/auth/register   注册
 *   POST /api/auth/login      登录，返回 token
 *   GET  /api/auth/me         获取当前登录用户信息（需鉴权）
 *   PUT  /api/auth/profile    修改个人资料（需鉴权）
 *   PUT  /api/auth/password   修改密码（需鉴权）
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
const { authRequired } = require('../middleware/auth');

// 个人中心的资料/密码接口只要求登录，不挂 requirePerm：
// operator 角色没有 profile:view 权限点，但它同样需要能改自己的密码
router.post('/register', register);
router.post('/login', login);
router.get('/me', authRequired, me);
router.put('/profile', authRequired, updateProfile);
router.put('/password', authRequired, updatePassword);

module.exports = router;
