/**
 * 系统设置路由（全部需鉴权 + 接口级权限）
 *   GET  /api/settings        读取全部设置（合并默认值）
 *   PUT  /api/settings        保存设置（支持部分字段）
 *   POST /api/settings/reset  恢复默认设置
 *
 * 写操作不再复用 settings:view（查看权限删库不合理），
 * 改为 settings:update；旧库还没建这个权限点时，回落到 settings:view 保持兼容。
 */
// Express 路由工厂
const express = require('express');
const router = express.Router();
// 控制器：读、写、重置
const { getAll, save, reset } = require('../controllers/settingsController');
// 鉴权 + 权限
const { authRequired, requirePerm } = require('../middleware/auth');

// 统一要求登录
router.use(authRequired);

// 读取：不做接口级权限校验（设置项本身已由前端按权限渲染）
router.get('/', getAll);
// 保存：settings:update 或 settings:view（任一满足，兼容旧权限数据）
router.put('/', requirePerm('settings:update', 'settings:view'), save);
// 重置同上
router.post('/reset', requirePerm('settings:update', 'settings:view'), reset);

// 导出路由
module.exports = router;
