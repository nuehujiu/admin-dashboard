/**
 * 认证控制器：注册、登录、当前用户
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { success, fail } = require('../utils/response');

/** 生成 JWT */
function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role_id: user.role_id, role_name: user.role_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
  );
}

/** 注册（默认分配「运营」角色） */
async function register(req, res, next) {
  try {
    const { username, password, nickname = '', email = '' } = req.body || {};

    if (!username || !password) {
      return fail(res, '用户名和密码不能为空');
    }
    if (username.length < 3 || password.length < 6) {
      return fail(res, '用户名至少 3 位，密码至少 6 位');
    }

    const exists = await query('SELECT id FROM users WHERE username = ?', [username]);
    if (exists.length) {
      return fail(res, '用户名已被占用');
    }

    // 默认分配「运营」角色
    const role = await query("SELECT id FROM roles WHERE code = 'operator'");
    const roleId = role.length ? role[0].id : null;

    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO users (username, password, nickname, email, role_id, status) VALUES (?,?,?,?,?,1)',
      [username, hash, nickname, email, roleId]
    );

    return success(res, { id: result.insertId }, '注册成功');
  } catch (err) {
    next(err);
  }
}

/** 登录 */
async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return fail(res, '用户名和密码不能为空');
    }

    const rows = await query(
      `SELECT u.id, u.username, u.password, u.nickname, u.email, u.avatar,
              u.role_id, u.status, r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.username = ?`,
      [username]
    );

    if (!rows.length) {
      return fail(res, '用户名或密码错误');
    }
    const user = rows[0];

    if (user.status === 0) {
      return fail(res, '账号已被禁用，请联系管理员');
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return fail(res, '用户名或密码错误');
    }

    const token = signToken(user);
    return success(res, {
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        email: user.email,
        avatar: user.avatar,
        role_id: user.role_id,
        role_name: user.role_name,
      },
    }, '登录成功');
  } catch (err) {
    next(err);
  }
}

/** 当前登录用户信息（含菜单权限） */
async function me(req, res, next) {
  try {
    const rows = await query(
      `SELECT u.id, u.username, u.nickname, u.email, u.avatar,
              u.role_id, u.status, r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows.length) {
      return fail(res, '用户不存在', 404, 404);
    }
    const user = rows[0];

    // 该角色拥有的菜单与按钮权限
    const menus = await query(
      `SELECT m.id, m.parent_id, m.name, m.path, m.icon, m.type, m.permission, m.sort
       FROM role_menu rm
       JOIN menus m ON m.id = rm.menu_id
       WHERE rm.role_id = ? AND m.type = 1
       ORDER BY m.sort`,
      [user.role_id]
    );
    const perms = await query(
      `SELECT m.permission FROM role_menu rm JOIN menus m ON m.id = rm.menu_id WHERE rm.role_id = ?`,
      [user.role_id]
    );

    return success(res, {
      ...user,
      menus,
      permissions: perms.map((p) => p.permission).filter(Boolean),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me };
