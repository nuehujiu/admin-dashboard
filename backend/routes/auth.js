/**
 * 认证路由
 *   POST /api/auth/register   注册（需登录 + 拥有 user:create 权限）
 *   POST /api/auth/login      登录，返回 token（限流）
 *   GET  /api/auth/me         获取当前登录用户信息（需鉴权）
 *   POST /api/auth/avatar     上传头像，落盘后返回 URL（需鉴权）
 *   PUT  /api/auth/profile    修改个人资料（需鉴权）
 *   PUT  /api/auth/password   修改密码（需鉴权）
 *
 * 注册接口不再公开：后台系统不允许陌生人自建账号，
 * 需要开账号时由管理员在「用户管理」里加，或调本接口（带管理员 token）。
 */
// Express 路由工厂
const express = require('express');
// 独立路由实例，最后挂到 /api/auth
const router = express.Router();
// 控制器：注册、登录、当前用户、改资料、传头像、改密码
const {
  register,
  login,
  me,
  updateProfile,
  uploadAvatar,
  updatePassword,
} = require('../controllers/authController');
// 鉴权与权限中间件
const { authRequired, requirePerm } = require('../middleware/auth');
// 登录限流（生产开启，开发默认放行）
const { loginLimiter } = require('../middleware/rateLimit');

// 个人中心的资料/密码接口只要求登录，不挂 requirePerm：
// operator 角色没有 profile:view 权限点，但它同样需要能改自己的密码

// 注册：必须已登录且拥有 user:create（避免被外部随意开号）
router.post('/register', authRequired, requirePerm('user:create'), register);
// 登录：公开接口，但受 IP 限流保护
router.post('/login', loginLimiter, login);
// 获取当前登录用户信息（含菜单与权限点）
router.get('/me', authRequired, me);
router.post('/avatar', authRequired, uploadAvatar); // 头像上传（落盘存 URL）
// 修改个人资料
router.put('/profile', authRequired, updateProfile);
// 修改密码（旧密码校验在新密码之外还要求重新登录）
router.put('/password', authRequired, updatePassword);

// 导出路由
module.exports = router;
