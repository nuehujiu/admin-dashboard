/**
 * 菜单/权限项控制器
 * 角色管理的「权限矩阵」需要拿到全量权限项（含按钮级），按 parent_id + sort 排序
 */
// 查询助手
const { query } = require('../config/db');
// 统一成功响应
const { success } = require('../utils/response');

/** 全量菜单与按钮权限 */
async function list(req, res, next) {
  try {
    // 一次取全量：菜单（type=menu）+ 按钮（type=button），前端自行按 permission 分组
    const rows = await query(
      `SELECT id, parent_id, name, path, icon, type, permission, sort
       FROM menus
       ORDER BY parent_id, sort, id`
    );
    // 排序策略：先按父级、再按 sort 次序、最后按 id 兜底（sort 相同时保持稳定）
    return success(res, rows);
  } catch (err) {
    // 交给统一错误处理
    next(err);
  }
}

// 只导出 list
module.exports = { list };
