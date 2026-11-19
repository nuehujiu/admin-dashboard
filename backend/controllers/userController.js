/**
 * 用户管理控制器
 */
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { success, fail, paged } = require('../utils/response');

/** 分页列表，支持 keyword / role_id / status 筛选，sort=recent 按最近登录排序 */
async function list(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
    const { keyword, role_id, status, sort } = req.query;

    const where = [];
    const params = [];

    if (keyword) {
      // 设计稿搜索框是「姓名 / 邮箱 / 登录名」，三个字段都要能命中
      where.push('(u.username LIKE ? OR u.nickname LIKE ? OR u.email LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
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
    // 「最近登录」倒序，从未登录的排最后
    const orderSql = sort === 'recent'
      ? 'ORDER BY u.last_login_at IS NULL, u.last_login_at DESC, u.id DESC'
      : 'ORDER BY u.id DESC';

    const countRows = await query(
      `SELECT COUNT(*) AS total FROM users u ${whereSql}`,
      params
    );
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const rows = await query(
      `SELECT u.id, u.username, u.nickname, u.email, u.avatar,
              u.role_id, r.name AS role_name, u.status, u.created_at, u.last_login_at
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       ${whereSql}
       ${orderSql}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return paged(res, { list: rows, total, page, pageSize });
  } catch (err) {
    next(err);
  }
}

/**
 * 概览：总数 / 本周新增 / 启用数 / 禁用数
 * GET /api/users/summary
 */
async function summary(req, res, next) {
  try {
    const rows = await query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) AS disabled,
              SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS week_new
       FROM users`
    );
    const r = rows[0] || {};
    return success(res, {
      total: Number(r.total) || 0,
      active: Number(r.active) || 0,
      disabled: Number(r.disabled) || 0,
      weekNew: Number(r.week_new) || 0,
    });
  } catch (err) {
    next(err);
  }
}

/** 批量 ids 校验：非空数组、正整数、自动去重、最多 100 条 */
function normalizeIds(v, max = 100) {
  if (!Array.isArray(v) || !v.length) {
    return { ok: false, message: 'ids 必须是非空数组' };
  }
  const set = new Set();
  for (const item of v) {
    const n = Number(item);
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, message: 'ids 只能为正整数' };
    }
    set.add(n);
  }
  if (set.size > max) {
    return { ok: false, message: `一次最多操作 ${max} 个用户` };
  }
  return { ok: true, ids: [...set] };
}

/**
 * 批量启用 / 禁用
 * PUT /api/users/batch/status  { ids: number[], status: 0 | 1 }
 * 禁用时自动跳过当前登录账号，返回 { affected, missing, skipped }
 */
async function batchStatus(req, res, next) {
  try {
    const body = req.body || {};

    const idsCheck = normalizeIds(body.ids);
    if (!idsCheck.ok) return fail(res, idsCheck.message);

    const status = Number(body.status);
    if (status !== 0 && status !== 1) {
      return fail(res, 'status 只能为 0 或 1');
    }

    const selfId = Number(req.user.id);
    let ids = idsCheck.ids;
    const skipped = [];
    // 不能禁用当前登录账号，从批次里剔除并回报
    if (status === 0 && ids.includes(selfId)) {
      ids = ids.filter((id) => id !== selfId);
      skipped.push(selfId);
    }

    if (!ids.length) {
      return fail(res, '当前登录账号不能被禁用');
    }

    const ph = ids.map(() => '?').join(',');
    const found = await query(`SELECT id FROM users WHERE id IN (${ph})`, ids);
    const foundIds = found.map((r) => r.id);
    const missing = ids.filter((id) => !foundIds.includes(id));

    let affected = 0;
    if (foundIds.length) {
      const result = await query(
        `UPDATE users SET status = ? WHERE id IN (${foundIds.map(() => '?').join(',')})`,
        [status, ...foundIds]
      );
      affected = result.affectedRows || 0;
    }

    const verb = status === 1 ? '启用' : '禁用';
    return success(
      res,
      { affected, missing, skipped },
      affected > 0 ? `已${verb} ${affected} 个用户` : '没有可操作的用户'
    );
  } catch (err) {
    next(err);
  }
}

/** 详情 */
async function detail(req, res, next) {
  try {
    const rows = await query(
      `SELECT u.id, u.username, u.nickname, u.email, u.avatar,
              u.role_id, r.name AS role_name, u.status, u.created_at, u.last_login_at, u.updated_at
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

module.exports = {
  list,
  summary,
  detail,
  create,
  update,
  toggleStatus,
  remove,
  batchStatus,
};
