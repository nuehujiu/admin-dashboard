/**
 * 鉴权 / 授权中间件
 *
 * authRequired：解析 JWT，把用户挂到 req.user
 * requirePerm：按「角色 → role_menu → menus.permission」判断接口权限，
 *              多个权限点之间是「任一满足即通过」
 *
 * 使用顺序：路由上先 authRequired 再 requirePerm
 */
// 签发 / 校验 token
const jwt = require('jsonwebtoken');
// 复用连接池查询助手
const { query } = require('../config/db');

/**
 * 登录态校验：从 Authorization 头解析 Bearer token 并验签
 * 成功：把 payload 挂到 req.user 后继续
 * 失败：直接返回 401，前端拦截器会清登录态并跳 /login
 */
function authRequired(req, res, next) {
  // 取请求头，缺省为空串避免 undefined
  const header = req.headers.authorization || '';
  // 只接受 "Bearer <token>" 形式，len('Bearer ')=7
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  // 没有 token 等同于未登录
  if (!token) {
    return res.status(401).json({ code: 401, message: '未登录或 token 缺失', data: null });
  }

  try {
    // 验签 + 过期校验，密钥必须与签发时一致
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // payload: { id, username, role_id, role_name }
    // 注意：payload 里的 role_id 是签发时的快照，权限判断以它为准
    req.user = payload;
    next();
  } catch (err) {
    // 签名不对 / 已过期 / 格式非法都归为 401
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
      // 查当前角色拥有的全部权限点（排除已停用角色？——此处按 role_id 直取）
      const rows = await query(
        `SELECT m.permission
           FROM role_menu rm
           JOIN menus m ON m.id = rm.menu_id
          WHERE rm.role_id = ?`,
        [req.user.role_id],
      );
      // 用 Set 去重，并过滤掉 permission 为空的菜单项（父级目录通常没有 permission）
      const owned = new Set(rows.map((r) => r.permission).filter(Boolean));
      // 每次请求实时查表：角色权限改完立刻生效，不用重启服务
      // some：多个权限点之间是「任一满足即可」
      const allowed = required.some((p) => owned.has(p));

      if (!allowed) {
        return res
          .status(403)
          .json({ code: 403, message: '当前角色无此操作权限', data: null });
      }
      next();
    } catch (err) {
      // 数据库异常交给统一错误处理
      next(err);
    }
  };
}

// 导出两个中间件
module.exports = { authRequired, requirePerm };
