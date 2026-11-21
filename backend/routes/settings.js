/**
 * 系统设置路由（全部需鉴权 + 接口级权限）
 *   GET  /api/settings        读取全部设置（合并默认值）
 *   PUT  /api/settings        保存设置（支持部分字段）
 *   POST /api/settings/reset  恢复默认设置
 *
 * 写操作不再复用 settings:view（查看权限删库不合理），
 * 改为 settings:update；旧库还没建这个权限点时，回落到 settings:view 保持兼容。
 */
const express = require('express');
const router = express.Router();
const { getAll, save, reset } = require('../controllers/settingsController');
const { authRequired, requirePerm } = require('../middleware/auth');

router.use(authRequired);

router.get('/', getAll);
router.put('/', requirePerm('settings:update', 'settings:view'), save);
router.post('/reset', requirePerm('settings:update', 'settings:view'), reset);

module.exports = router;
