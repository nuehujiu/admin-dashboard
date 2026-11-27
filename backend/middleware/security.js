/**
 * 基础安全响应头（不引入 helmet，保持零新依赖）
 * 注册位置：尽量靠近最外层（放在最前面，保证所有响应都带上）
 */
function securityHeaders(req, res, next) {
  // 禁止浏览器猜测 MIME（避免把 .txt 当脚本执行）
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // 禁止被 iframe 嵌套，防点击劫持
  res.setHeader('X-Frame-Options', 'DENY');
  // 跨站跳转不带 Referer，避免路径信息外泄
  res.setHeader('Referrer-Policy', 'no-referrer');
  // 关闭定位/麦克风/摄像头等敏感能力（本项目用不到）
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // 只允许同站加载资源，防他站盗用图片/接口响应
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  // 只有通过 HTTPS 访问时才下发 HSTS，避免本地 http 被浏览器记住
  if (req.secure) {
    // 一年内强制 HTTPS，并覆盖子域名
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

// 导出中间件
module.exports = { securityHeaders };
