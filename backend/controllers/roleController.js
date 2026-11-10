/**
 * 角色管理控制器
 */
const { query } = require('../config/db');
const { success, fail } = require('../utils/response');

/** 角色列表 */
async function list(req, res, next) {
  try {
    const rows = await query(
      `SELECT r.id, r.name, r.code, r.description, r.created_at,
              (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
       FROM roles r ORDER BY r.id`
    );
    return success(res, rows);
  } catch (err) {
    next(err);
  }
}

/** 新增角色 */
async function create(req, res, next) {
  try {
    const { name, code, description = '' } = req.body || {};
    if (!name || !code) {
      return fail(res, '角色名称和编码为必填项');
    }
    const exists = await query('SELECT id FROM roles WHERE code = ?', [code]);
    if (exists.length) {
      return fail(res, '角色编码已存在');
    }
    const result = await query(
      'INSERT INTO roles (name, code, description) VALUES (?,?,?)',
      [name, code, description]
    );
    return success(res, { id: result.insertId }, '新增成功');
  } catch (err) {
    next(err);
  }
}

/** 编辑角色 */
async function update(req, res, next) {
  try {
    const id = req.params.id;
    const { name, description } = req.body || {};
    const exists = await query('SELECT id FROM roles WHERE id = ?', [id]);
    if (!exists.length) {
      return fail(res, '角色不存在', 404, 404);
    }
    await query('UPDATE roles SET name = ?, description = ? WHERE id = ?', [name, description, id]);
    return success(res, null, '更新成功');
  } catch (err) {
    next(err);
  }
}

/** 删除角色 */
async function remove(req, res, next) {
  try {
    const id = req.params.id;
    const role = await query('SELECT id FROM roles WHERE id = ?', [id]);
    if (!role.length) {
      return fail(res, '角色不存在', 404, 404);
    }
    const count = await query('SELECT COUNT(*) AS c FROM users WHERE role_id = ?', [id]);
    if (count[0].c > 0) {
      return fail(res, '该角色下仍有用户，无法删除');
    }
    await query('DELETE FROM roles WHERE id = ?', [id]);
    return success(res, null, '删除成功');
  } catch (err) {
    next(err);
  }
}

/** 获取某角色的菜单权限 ID 列表 */
async function getMenus(req, res, next) {
  try {
    const rows = await query(
      'SELECT menu_id FROM role_menu WHERE role_id = ?',
      [req.params.id]
    );
    return success(res, rows.map((r) => r.menu_id));
  } catch (err) {
    next(err);
  }
}

/** 分配菜单权限（全量覆盖） */
async function assignMenus(req, res, next) {
  try {
    const roleId = req.params.id;
    const { menu_ids = [] } = req.body || {};

    const role = await query('SELECT id FROM roles WHERE id = ?', [roleId]);
    if (!role.length) {
      return fail(res, '角色不存在', 404, 404);
    }

    const ids = Array.isArray(menu_ids) ? menu_ids.map(Number).filter((n) => Number.isInteger(n)) : [];

    await query('DELETE FROM role_menu WHERE role_id = ?', [roleId]);
    if (ids.length) {
      const values = ids.map((mid) => [roleId, mid]);
      await query('INSERT INTO role_menu (role_id, menu_id) VALUES ?', [values]);
    }
    return success(res, null, '权限分配成功');
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove, getMenus, assignMenus };
