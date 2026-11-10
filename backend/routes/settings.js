/**
 * 系统设置路由（全部需鉴权）
 *   GET  /api/settings        读取全部设置（合并默认值）
 *   PUT  /api/settings        保存设置（支持部分字段）
 *   POST /api/settings/reset  恢复默认设置
 */
const express = require('express');
const router = express.Router();
const { getAll, save, reset } = require('../controllers/settingsController');
const { authRequired } = require('../middleware/auth');

router.use(authRequired);

router.get('/', getAll);
router.put('/', save);
router.post('/reset', reset);

module.exports = router;
