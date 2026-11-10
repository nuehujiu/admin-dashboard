/**
 * 数据看板路由（全部需鉴权）
 *   GET /api/dashboard/overview      概览卡片数据
 *   GET /api/dashboard/trend         销售趋势（按天）
 *   GET /api/dashboard/category-ratio 分类销售占比
 *   GET /api/dashboard/rank          销售排行（分类 TOP N）
 */
const express = require('express');
const router = express.Router();
const {
  overview,
  trend,
  categoryRatio,
  rank,
} = require('../controllers/dashboardController');
const { authRequired } = require('../middleware/auth');

router.use(authRequired);

router.get('/overview', overview);
router.get('/trend', trend);
router.get('/category-ratio', categoryRatio);
router.get('/rank', rank);

module.exports = router;
