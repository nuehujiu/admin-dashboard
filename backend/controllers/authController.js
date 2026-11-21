/**
 * 认证控制器：注册、登录、当前用户、个人资料、修改密码
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { success, fail } = require('../utils/response');
const {
  AVATAR_URL_PREFIX,
  saveAvatarFromDataUrl,
  removeAvatarByUrl,
} = require('../config/upload');

/** 头像 dataURL 上限（前端已压到 128px，正常十几 KB） */
const AVATAR_MAX = 200 * 1024;
const PHONE_RE = /^1[3-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 生成 JWT */
function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role_id: user.role_id, role_name: user.role_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
  );
}

/**
 * 读当前用户的基础资料
 * 时间字段在 SQL 里格式化成字符串，避免 Date 经 JSON 序列化后带时区偏移
 */
async function readSelf(userId) {
  const rows = await query(
    `SELECT u.id, u.username, u.nickname, u.email, u.phone, u.intro, u.avatar,
            u.role_id, u.status, r.name AS role_name,
            DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i') AS created_at,
            DATE_FORMAT(u.updated_at, '%Y-%m-%d %H:%i') AS updated_at,
            DATE_FORMAT(u.last_login_at, '%Y-%m-%d %H:%i') AS last_login_at
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.id = ?`,
    [userId]
  );
  return rows[0] || null;
}

/** 组装 /me 的完整返回体（资料 + 菜单 + 权限点），资料保存后也复用它 */
async function mePayload(userId) {
  const user = await readSelf(userId);
  if (!user) return null;

  const menus = await query(
    `SELECT m.id, m.parent_id, m.name, m.path, m.icon, m.type, m.permission, m.sort
     FROM role_menu rm
     JOIN menus m ON m.id = rm.menu_id
     WHERE rm.role_id = ? AND m.type = 1
     ORDER BY m.sort`,
    [user.role_id]
  );
  const perms = await query(
    'SELECT m.permission FROM role_menu rm JOIN menus m ON m.id = rm.menu_id WHERE rm.role_id = ?',
    [user.role_id]
  );

  return {
    ...user,
    menus,
    permissions: perms.map((p) => p.permission).filter(Boolean),
  };
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

    // 默认分配「运营」角色；角色表没初始化好时给出明确错误，而不是让 role_id=null 撞 NOT NULL
    const role = await query("SELECT id FROM roles WHERE code = 'operator'");
    if (!role.length) {
      return fail(res, '未找到默认角色（operator），请先执行 npm run init-db', 500, 500);
    }
    const roleId = role[0].id;

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

    // 记录最近登录时间（用户管理列表的「最近登录」列与个人中心都依赖它）
    await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

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
    const payload = await mePayload(req.user.id);
    if (!payload) return fail(res, '用户不存在', 404, 404);
    return success(res, payload);
  } catch (err) {
    next(err);
  }
}

/**
 * 修改个人资料
 * 只允许改自己：用户 id 取自 token，不接受前端传 id；角色不可自助修改
 */
async function updateProfile(req, res, next) {
  try {
    const body = req.body || {};
    const patch = {};
    let oldAvatar = null;
    let avatarChanged = false;

    if (body.nickname !== undefined) {
      const v = String(body.nickname ?? '').trim();
      if (!v) return fail(res, '昵称不能为空');
      if (v.length > 50) return fail(res, '昵称不能超过 50 个字');
      patch.nickname = v;
    }
    if (body.phone !== undefined) {
      const v = String(body.phone ?? '').trim();
      if (v && !PHONE_RE.test(v)) return fail(res, '手机号格式不正确');
      patch.phone = v || null;
    }
    if (body.email !== undefined) {
      const v = String(body.email ?? '').trim();
      if (v && !EMAIL_RE.test(v)) return fail(res, '邮箱格式不正确');
      if (v.length > 100) return fail(res, '邮箱不能超过 100 个字符');
      patch.email = v || null;
    }
    if (body.intro !== undefined) {
      const v = String(body.intro ?? '');
      if (v.length > 200) return fail(res, '个人简介不能超过 200 个字');
      patch.intro = v;
    }
    if (body.avatar !== undefined) {
      const v = String(body.avatar || '').trim();
      if (!v) {
        // 清空头像：保存后删掉旧文件
        patch.avatar = null;
        avatarChanged = true;
      } else if (v.startsWith(AVATAR_URL_PREFIX) && v.length <= 200) {
        // 已经由上传接口落盘，DB 只存相对 URL
        patch.avatar = v;
        avatarChanged = true;
      } else if (v.startsWith('data:image/')) {
        // 兼容老前端：收 dataURL，但落盘后仍然只存 URL，避免 base64 进 DB
        if (v.length > AVATAR_MAX) return fail(res, '头像文件过大，请重新选择');
        const saved = saveAvatarFromDataUrl(req.user.id, v);
        patch.avatar = saved.url;
        avatarChanged = true;
      } else {
        return fail(res, '头像格式不支持');
      }
    }

    // 列名全部来自上面的白名单分支，不存在 SQL 注入面
    const keys = Object.keys(patch);
    if (!keys.length) return fail(res, '没有可保存的资料项');

    // 头像要换时先记下旧文件，更新成功后再删，避免写库失败却把旧图删了
    if (avatarChanged) {
      const rows = await query('SELECT avatar FROM users WHERE id = ?', [req.user.id]);
      oldAvatar = rows[0]?.avatar || null;
    }

    await query(
      `UPDATE users SET ${keys.map((k) => `\`${k}\` = ?`).join(', ')}, updated_at = NOW() WHERE id = ?`,
      [...keys.map((k) => patch[k]), req.user.id]
    );

    if (oldAvatar && oldAvatar !== patch.avatar) removeAvatarByUrl(oldAvatar);

    const payload = await mePayload(req.user.id);
    return success(res, payload, '资料已保存');
  } catch (err) {
    next(err);
  }
}

/**
 * 上传头像（文件存储）
 *   POST /api/auth/avatar  { dataUrl }
 * 服务端解码后写进 uploads/avatars，DB 只存 /uploads/avatars/xxx.jpg；
 * 同时替换掉旧文件，避免上传目录越堆越多。
 */
async function uploadAvatar(req, res, next) {
  try {
    const { dataUrl } = req.body || {};
    if (!dataUrl) return fail(res, '请先选择图片');

    const rows = await query('SELECT avatar FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return fail(res, '用户不存在', 404, 404);

    const saved = saveAvatarFromDataUrl(req.user.id, dataUrl);
    await query('UPDATE users SET avatar = ?, updated_at = NOW() WHERE id = ?', [
      saved.url,
      req.user.id,
    ]);
    removeAvatarByUrl(rows[0].avatar);

    return success(res, { avatar: saved.url }, '头像已更新');
  } catch (err) {
    if (err && err.status) return fail(res, err.message, err.status, err.status);
    next(err);
  }
}

/** 修改密码（校验当前密码；成功后前端需重新登录） */async function updatePassword(req, res, next) {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) {
      return fail(res, '请填写当前密码与新密码');
    }
    if (newPassword.length < 6) return fail(res, '新密码至少 6 位');
    if (newPassword.length > 32) return fail(res, '新密码不能超过 32 位');
    if (oldPassword === newPassword) return fail(res, '新密码不能与当前密码相同');

    const rows = await query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return fail(res, '用户不存在', 404, 404);

    const ok = await bcrypt.compare(oldPassword, rows[0].password);
    if (!ok) return fail(res, '当前密码不正确');

    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password = ? WHERE id = ?', [hash, req.user.id]);

    return success(res, null, '密码已修改，请重新登录');
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me, updateProfile, uploadAvatar, updatePassword };
