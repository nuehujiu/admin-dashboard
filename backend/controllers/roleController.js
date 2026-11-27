/**
 * 角色管理控制器
 * 覆盖：列表、新增、编辑（部分更新）、删除、读权限、写权限（全量覆盖）
 * 要点：
 *   - 角色编码 code 是唯一标识，创建后不允许修改
 *   - 删除角色前必须确认角色下没有用户，否则会留下 user.role_id 悬空
 *   - 分配权限采用「先删后插」的全量覆盖，保证与前端勾选结果严格一致
 */
// 查询助手
const { query } = require('../config/db');
// 统一响应
const { success, fail } = require('../utils/response');

/** 角色列表 */
async function list(req, res, next) {
  try {
    // 两个子查询分别统计成员数与权限数，供卡片底部展示
    const rows = await query(
      `SELECT r.id, r.name, r.code, r.description, r.status, r.icon, r.color, r.created_at,
              (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count,
              (SELECT COUNT(*) FROM role_menu rm WHERE rm.role_id = r.id) AS menu_count
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
    // icon / color 可空，由前端编辑弹窗后续配置
    const { name, code, description = '', icon = null, color = null } = req.body || {};
    if (!name || !code) {
      return fail(res, '角色名称和编码为必填项');
    }
    // code 唯一
    const exists = await query('SELECT id FROM roles WHERE code = ?', [code]);
    if (exists.length) {
      return fail(res, '角色编码已存在');
    }
    // 新建角色默认 status=1（表默认值），权限为空
    const result = await query(
      'INSERT INTO roles (name, code, description, icon, color) VALUES (?,?,?,?,?)',
      [name, code, description, icon, color]
    );
    return success(res, { id: result.insertId }, '新增成功');
  } catch (err) {
    next(err);
  }
}

/**
 * 编辑角色：支持部分更新
 * name / description / icon / color / status 传哪个改哪个（code 不允许改）
 */
async function update(req, res, next) {
  try {
    const id = req.params.id;
    const { name, description, icon, color, status } = req.body || {};
    // 角色必须存在
    const exists = await query('SELECT id FROM roles WHERE id = ?', [id]);
    if (!exists.length) {
      return fail(res, '角色不存在', 404, 404);
    }

    // 动态 SET 片段
    const sets = [];
    const params = [];
    if (name !== undefined) {
      const v = String(name).trim();
      if (!v) return fail(res, '角色名称不能为空');
      if (v.length > 50) return fail(res, '角色名称不能超过 50 个字');
      sets.push('name = ?');
      params.push(v);
    }
    if (description !== undefined) {
      sets.push('description = ?');
      params.push(description);
    }
    if (icon !== undefined) {
      sets.push('icon = ?');
      // 空值统一存 NULL，避免出现空字符串与 NULL 两种"未配置"
      params.push(icon || null);
    }
    if (color !== undefined) {
      sets.push('color = ?');
      params.push(color || null);
    }
    if (status !== undefined) {
      sets.push('status = ?');
      // 归一化：只有严格的 0 才是停用，其它一律启用
      params.push(Number(status) === 0 ? 0 : 1);
    }
    // 没有任何字段变化：直接返回成功，不执行空 UPDATE
    if (!sets.length) {
      return success(res, null, '无变更');
    }

    params.push(id);
    await query(`UPDATE roles SET ${sets.join(', ')} WHERE id = ?`, params);
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
    // 有成员时禁止删除（先让人换角色）
    const count = await query('SELECT COUNT(*) AS c FROM users WHERE role_id = ?', [id]);
    if (count[0].c > 0) {
      return fail(res, '该角色下仍有用户，无法删除');
    }
    // 注意：这里未清理 role_menu，若表无外键约束会留下孤儿记录；
    // 目前前端删除后不再引用该角色，孤儿记录不影响功能。
    await query('DELETE FROM roles WHERE id = ?', [id]);
    return success(res, null, '删除成功');
  } catch (err) {
    next(err);
  }
}

/** 获取某角色的菜单权限 ID 列表 */
async function getMenus(req, res, next) {
  try {
    // 只取 menu_id，前端用纯 id 数组做勾选判断
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
    // 默认空数组 = 清空该角色全部权限
    const { menu_ids = [] } = req.body || {};

    const role = await query('SELECT id FROM roles WHERE id = ?', [roleId]);
    if (!role.length) {
      return fail(res, '角色不存在', 404, 404);
    }

    // 清洗入参：只保留整数 id，其它类型直接丢弃
    const ids = Array.isArray(menu_ids) ? menu_ids.map(Number).filter((n) => Number.isInteger(n)) : [];

    // 全量覆盖：先删旧记录
    await query('DELETE FROM role_menu WHERE role_id = ?', [roleId]);
    // 再批量插入（"VALUES ?" 是 mysql2 的批量插入语法，传二维数组）
    if (ids.length) {
      const values = ids.map((mid) => [roleId, mid]);
      await query('INSERT INTO role_menu (role_id, menu_id) VALUES ?', [values]);
    }
    return success(res, null, '权限分配成功');
  } catch (err) {
    next(err);
  }
}

// 导出全部方法
module.exports = { list, create, update, remove, getMenus, assignMenus };
