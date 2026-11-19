/**
 * 菜单/权限项控制器
 * 角色管理的「权限矩阵」需要拿到全量权限项（含按钮级），按 parent_id + sort 排序
 */
const { query } = require('../config/db');
const { success } = require('../utils/response');

/** 全量菜单与按钮权限 */
async function list(req, res, next) {
  try {
    const rows = await query(
      `SELECT id, parent_id, name, path, icon, type, permission, sort
       FROM menus
       ORDER BY parent_id, sort, id`
    );
    return success(res, rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
