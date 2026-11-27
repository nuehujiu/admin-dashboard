/**
 * 销售明细路由（需鉴权）
 *   GET /api/sales/stats   整页统计（KPI + 环比 + 趋势 + 品类占比）
 *   GET /api/sales         明细分页，支持 start / end / category_id
 */
// Express 路由工厂
const express = require('express');
const router = express.Router();
// 控制器：明细列表与统计
const { list, stats } = require('../controllers/salesController');
// 鉴权 + 权限
const { authRequired, requirePerm } = require('../middleware/auth');

// 统一要求登录
router.use(authRequired);
// 整个销售模块统一要求 sales:view
router.use(requirePerm('sales:view'));
// 统计接口要放在 / 之前（虽然是不同路径，仍保持静态优先的习惯）
router.get('/stats', stats);
// 明细列表
router.get('/', list);

// 导出路由
module.exports = router;
