/**
 * 认证控制器：注册、登录、当前用户、个人资料、修改密码
 * 约定：
 *   - 所有对外身份相关字段都从 token 取（req.user.id），不接受前端传 id
 *   - 密码统一 bcrypt 加盐哈希，数据库只存哈希
 *   - 时间字段在 SQL 里用 DATE_FORMAT 转字符串，避免 JSON 序列化带时区偏移
 */
// 密码哈希 / 校验
const bcrypt = require('bcryptjs');
// JWT 签发 / 验签（验签在中间件里做）
const jwt = require('jsonwebtoken');
// 查询助手
const { query } = require('../config/db');
// 统一响应
const { success, fail } = require('../utils/response');
// 头像存储：URL 前缀、落盘、删文件
const {
  AVATAR_URL_PREFIX,
  saveAvatarFromDataUrl,
  removeAvatarByUrl,
} = require('../config/upload');

/** 头像 dataURL 上限（前端已压到 128px，正常十几 KB） */
const AVATAR_MAX = 200 * 1024;
// 手机号：11 位、1 开头、第二位 3-9
const PHONE_RE = /^1[3-9]\d{9}$/;
// 邮箱：简单格式校验（只挡明显错误，不做 RFC 全量校验）
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 生成 JWT
 * payload 只装身份必需字段，避免把敏感信息/大字段塞进 token
 * @param {object} user - 至少含 id / username / role_id / role_name
 */
function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role_id: user.role_id, role_name: user.role_name },
    process.env.JWT_SECRET,
    // 有效期默认 2 小时，可用 JWT_EXPIRES_IN 覆盖
    { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
  );
}

/**
 * 读当前用户的基础资料
 * 时间字段在 SQL 里格式化成字符串，避免 Date 经 JSON 序列化后带时区偏移
 * @param {number} userId
 * @returns {Promise<object|null>}
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
  // 用 LEFT JOIN：角色被删也要能读到用户本身
  return rows[0] || null;
}

/** 组装 /me 的完整返回体（资料 + 菜单 + 权限点），资料保存后也复用它 */
async function mePayload(userId) {
  // 先取资料，用户不存在直接返回 null
  const user = await readSelf(userId);
  if (!user) return null;

  // 菜单：只取 type=1 的菜单项（按钮级不用于侧边栏渲染）
  const menus = await query(
    `SELECT m.id, m.parent_id, m.name, m.path, m.icon, m.type, m.permission, m.sort
     FROM role_menu rm
     JOIN menus m ON m.id = rm.menu_id
     WHERE rm.role_id = ? AND m.type = 1
     ORDER BY m.sort`,
    [user.role_id]
  );
  // 权限点：含按钮级，前端 can() 用它判断按钮显隐
  const perms = await query(
    'SELECT m.permission FROM role_menu rm JOIN menus m ON m.id = rm.menu_id WHERE rm.role_id = ?',
    [user.role_id]
  );

  return {
    ...user,
    menus,
    // 过滤空 permission（目录型菜单没有权限点）
    permissions: perms.map((p) => p.permission).filter(Boolean),
  };
}

/** 注册（默认分配「运营」角色） */
async function register(req, res, next) {
  try {
    // 只取需要字段，nickname / email 给默认空串
    const { username, password, nickname = '', email = '' } = req.body || {};

    // 必填校验
    if (!username || !password) {
      return fail(res, '用户名和密码不能为空');
    }
    if (username.length < 3 || password.length < 6) {
      return fail(res, '用户名至少 3 位，密码至少 6 位');
    }

    // 用户名唯一性检查
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

    // cost=10 的 bcrypt 哈希：约 100ms，兼顾安全与登录体验
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO users (username, password, nickname, email, role_id, status) VALUES (?,?,?,?,?,1)',
      [username, hash, nickname, email, roleId]
    );

    // 只回 id，不回密码等敏感字段
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

    // 取用户 + 角色名（登录返回里要给前端展示角色）
    const rows = await query(
      `SELECT u.id, u.username, u.password, u.nickname, u.email, u.avatar,
              u.role_id, u.status, r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.username = ?`,
      [username]
    );

    // 用户不存在与密码错误返回同一文案，避免账号枚举
    if (!rows.length) {
      return fail(res, '用户名或密码错误');
    }
    const user = rows[0];

    // 禁用账号直接拒绝
    if (user.status === 0) {
      return fail(res, '账号已被禁用，请联系管理员');
    }

    // 哈希比对
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return fail(res, '用户名或密码错误');
    }

    // 记录最近登录时间（用户管理列表的「最近登录」列与个人中心都依赖它）
    await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    // 签发 token
    const token = signToken(user);
    return success(res, {
      token,
      // 只返回展示所需字段，不含 password
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
    // id 来自 token，不接受前端指定
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
 * 采用「字段白名单 + 逐字段校验」写法：只处理 body 里出现的字段（部分更新）
 */
async function updateProfile(req, res, next) {
  try {
    const body = req.body || {};
    // 待更新字段集合（列名由代码写死，后续拼 SQL 无注入风险）
    const patch = {};
    // 旧头像地址（换头像成功后才删除文件）
    let oldAvatar = null;
    // 头像是否发生变化
    let avatarChanged = false;

    // 昵称：非空、≤50
    if (body.nickname !== undefined) {
      const v = String(body.nickname ?? '').trim();
      if (!v) return fail(res, '昵称不能为空');
      if (v.length > 50) return fail(res, '昵称不能超过 50 个字');
      patch.nickname = v;
    }
    // 手机号：可为空（清空），非空则校验格式
    if (body.phone !== undefined) {
      const v = String(body.phone ?? '').trim();
      if (v && !PHONE_RE.test(v)) return fail(res, '手机号格式不正确');
      // 空串统一存 NULL，便于 SQL 判空
      patch.phone = v || null;
    }
    // 邮箱：同上，额外限长 100
    if (body.email !== undefined) {
      const v = String(body.email ?? '').trim();
      if (v && !EMAIL_RE.test(v)) return fail(res, '邮箱格式不正确');
      if (v.length > 100) return fail(res, '邮箱不能超过 100 个字符');
      patch.email = v || null;
    }
    // 个人简介：≤200，允许为空
    if (body.intro !== undefined) {
      const v = String(body.intro ?? '');
      if (v.length > 200) return fail(res, '个人简介不能超过 200 个字');
      patch.intro = v;
    }
    // 头像：三种合法输入 —— 空（清空）、本系统 URL、dataURL（兼容老前端）
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

    // 动态拼 SET 子句：每列一个占位符，参数顺序与列顺序一致
    await query(
      `UPDATE users SET ${keys.map((k) => `\`${k}\` = ?`).join(', ')}, updated_at = NOW() WHERE id = ?`,
      [...keys.map((k) => patch[k]), req.user.id]
    );

    // 旧图与新地址不同才删，避免把刚写入的文件删掉
    if (oldAvatar && oldAvatar !== patch.avatar) removeAvatarByUrl(oldAvatar);

    // 返回最新完整信息（前端据此刷新顶栏与权限）
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

    // 先确认用户存在，并拿到旧头像地址
    const rows = await query('SELECT avatar FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return fail(res, '用户不存在', 404, 404);

    // 解码 + 校验 + 落盘（失败会抛带 status 的错误）
    const saved = saveAvatarFromDataUrl(req.user.id, dataUrl);
    // 写库只用相对 URL
    await query('UPDATE users SET avatar = ?, updated_at = NOW() WHERE id = ?', [
      saved.url,
      req.user.id,
    ]);
    // 删旧文件（内部已做安全过滤，失败静默）
    removeAvatarByUrl(rows[0].avatar);

    return success(res, { avatar: saved.url }, '头像已更新');
  } catch (err) {
    // convert 里的校验错误自带 status（400），转成业务错误返回
    if (err && err.status) return fail(res, err.message, err.status, err.status);
    next(err);
  }
}

/** 修改密码（校验当前密码；成功后前端需重新登录） */
async function updatePassword(req, res, next) {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) {
      return fail(res, '请填写当前密码与新密码');
    }
    // 新密码长度区间
    if (newPassword.length < 6) return fail(res, '新密码至少 6 位');
    if (newPassword.length > 32) return fail(res, '新密码不能超过 32 位');
    // 不允许新旧相同（否则等于没改）
    if (oldPassword === newPassword) return fail(res, '新密码不能与当前密码相同');

    // 取当前哈希
    const rows = await query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return fail(res, '用户不存在', 404, 404);

    // 校验当前密码
    const ok = await bcrypt.compare(oldPassword, rows[0].password);
    if (!ok) return fail(res, '当前密码不正确');

    // 重新哈希写库
    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password = ? WHERE id = ?', [hash, req.user.id]);

    // 服务端无状态，无法主动失效旧 token，由前端 logout + 重新登录
    return success(res, null, '密码已修改，请重新登录');
  } catch (err) {
    next(err);
  }
}

// 导出全部控制器方法
module.exports = { register, login, me, updateProfile, uploadAvatar, updatePassword };
