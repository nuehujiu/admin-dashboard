/**
 * 用户管理控制器
 */
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { success, fail, paged } = require('../utils/response');

/** 分页列表，支持 keyword / role_id / status 筛选 */
async function list(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
    const { keyword, role_id, status } = req.query;

    const where = [];
    const params = [];

    if (keyword) {
      where.push('(u.username LIKE ? OR u.nickname LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (role_id) {
      where.push('u.role_id = ?');
      params.push(role_id);
    }
    if (status !== undefined && status !== '') {
      where.push('u.status = ?');
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRows = await query(
      `SELECT COUNT(*) AS total FROM users u ${whereSql}`,
      params
    );
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const rows = await query(
      `SELECT u.id, u.username, u.nickname, u.email, u.avatar,
              u.role_id, r.name AS role_name, u.status, u.created_at
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       ${whereSql}
       ORDER BY u.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return paged(res, { list: rows, total, page, pageSize });
  } catch (err) {
    next(err);
  }
}

/** 详情 */
async function detail(req, res, next) {
  try {
    const rows = await query(
      `SELECT u.id, u.username, u.nickname, u.email, u.avatar,
              u.role_id, r.name AS role_name, u.status, u.created_at, u.updated_at
       FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
      [req.params.id]
    );
    if (!rows.length) {
      return fail(res, '用户不存在', 404, 404);
    }
    return success(res, rows[0]);
  } catch (err) {
    next(err);
  }
}

/** 新增用户 */
async function create(req, res, next) {
  try {
    const { username, password, nickname = '', email = '', role_id } = req.body || {};
    if (!username || !password || !role_id) {
      return fail(res, '用户名、密码、角色为必填项');
    }

    const exists = await query('SELECT id FROM users WHERE username = ?', [username]);
    if (exists.length) {
      return fail(res, '用户名已被占用');
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO users (username, password, nickname, email, role_id, status) VALUES (?,?,?,?,?,1)',
      [username, hash, nickname, email, role_id]
    );
    return success(res, { id: result.insertId }, '新增成功');
  } catch (err) {
    next(err);
  }
}

/** 编辑用户 */
async function update(req, res, next) {
  try {
    const id = req.params.id;
    const { nickname, email, role_id, password } = req.body || {};

    const exists = await query('SELECT id FROM users WHERE id = ?', [id]);
    if (!exists.length) {
      return fail(res, '用户不存在', 404, 404);
    }

    if (role_id) {
      const role = await query('SELECT id FROM roles WHERE id = ?', [role_id]);
      if (!role.length) {
        return fail(res, '角色不存在');
      }
    }

    const fields = [];
    const params = [];
    if (nickname !== undefined) { fields.push('nickname = ?'); params.push(nickname); }
    if (email !== undefined) { fields.push('email = ?'); params.push(email); }
    if (role_id !== undefined) { fields.push('role_id = ?'); params.push(role_id); }
    if (password) {
      fields.push('password = ?');
      params.push(await bcrypt.hash(password, 10));
    }

    if (fields.length) {
      params.push(id);
      await query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    }
    return success(res, null, '更新成功');
  } catch (err) {
    next(err);
  }
}

/** 启停用户 */
async function toggleStatus(req, res, next) {
  try {
    const id = req.params.id;
    const status = Number(req.body.status);
    if (status !== 0 && status !== 1) {
      return fail(res, 'status 只能为 0 或 1');
    }
    if (Number(id) === req.user.id) {
      return fail(res, '不能禁用当前登录账号');
    }

    const exists = await query('SELECT id FROM users WHERE id = ?', [id]);
    if (!exists.length) {
      return fail(res, '用户不存在', 404, 404);
    }

    await query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
    return success(res, null, '操作成功');
  } catch (err) {
    next(err);
  }
}

/** 删除用户 */
async function remove(req, res, next) {
  try {
    const id = req.params.id;
    if (Number(id) === req.user.id) {
      return fail(res, '不能删除当前登录账号');
    }
    const exists = await query('SELECT id FROM users WHERE id = ?', [id]);
    if (!exists.length) {
      return fail(res, '用户不存在', 404, 404);
    }
    await query('DELETE FROM users WHERE id = ?', [id]);
    return success(res, null, '删除成功');
  } catch (err) {
    next(err);
  }
}

module.exports = { list, detail, create, update, toggleStatus, remove };
