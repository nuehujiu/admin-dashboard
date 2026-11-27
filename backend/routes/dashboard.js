/**
 * 数据看板路由（全部需鉴权）
 *   GET /api/dashboard/overview      概览卡片数据
 *   GET /api/dashboard/trend         销售趋势（按天）
 *   GET /api/dashboard/category-ratio 分类销售占比
 *   GET /api/dashboard/rank          销售排行（分类 TOP N）
 */
// Express 路由工厂
const express = require('express');
const router = express.Router();
// 控制器：四个统计接口
const {
  overview, // 概览卡片
  trend, // 趋势
  categoryRatio, // 分类占比
  rank, // 排行
} = require('../controllers/dashboardController');
// 鉴权 + 权限
const { authRequired, requirePerm } = require('../middleware/auth');

// 整个看板统一要求登录
router.use(authRequired);
// 并统一要求 dashboard:view 权限（四个接口共用，无需逐个挂）
router.use(requirePerm('dashboard:view'));

router.get('/overview', overview);
router.get('/trend', trend);
router.get('/category-ratio', categoryRatio);
router.get('/rank', rank);

// 导出路由
module.exports = router;
