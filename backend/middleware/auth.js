/**
 * 鉴权 / 授权中间件
 *
 * authRequired：解析 JWT，把用户挂到 req.user
 * requirePerm：按「角色 → role_menu → menus.permission」判断接口权限，
 *              多个权限点之间是「任一满足即通过」
 */
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ code: 401, message: '未登录或 token 缺失', data: null });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // payload: { id, username, role_id, role_name }
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ code: 401, message: 'token 无效或已过期', data: null });
  }
}

/**
 * 接口级权限校验
 * @param {...string} required 需要的权限点，例如 requirePerm('user:create')
 * @returns {import('express').RequestHandler}
 */
function requirePerm(...required) {
  return async (req, res, next) => {
    try {
      const rows = await query(
        `SELECT m.permission
           FROM role_menu rm
           JOIN menus m ON m.id = rm.menu_id
          WHERE rm.role_id = ?`,
        [req.user.role_id],
      );
      const owned = new Set(rows.map((r) => r.permission).filter(Boolean));
      // 每次请求实时查表：角色权限改完立刻生效，不用重启服务
      const allowed = required.some((p) => owned.has(p));

      if (!allowed) {
        return res
          .status(403)
          .json({ code: 403, message: '当前角色无此操作权限', data: null });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { authRequired, requirePerm };
