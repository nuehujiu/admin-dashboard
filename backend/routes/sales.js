/**
 * 销售明细路由（需鉴权）
 *   GET /api/sales/stats   整页统计（KPI + 环比 + 趋势 + 品类占比）
 *   GET /api/sales         明细分页，支持 start / end / category_id
 */
const express = require('express');
const router = express.Router();
const { list, stats } = require('../controllers/salesController');
const { authRequired, requirePerm } = require('../middleware/auth');

router.use(authRequired);
router.use(requirePerm('sales:view'));
router.get('/stats', stats);
router.get('/', list);

module.exports = router;
