/**
 * JWT 鉴权中间件
 * 从 Authorization: Bearer <token> 中解析并校验 token，
 * 校验通过后将用户信息挂载到 req.user，供后续控制器使用。
 */
const jwt = require('jsonwebtoken');

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

module.exports = { authRequired };
