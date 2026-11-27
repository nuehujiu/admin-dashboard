/**
 * 全局错误处理中间件
 * 生产环境只回固定文案，内部细节（SQL 报错、字段名、库名）只进日志
 * 注册位置：所有路由之后（Express 靠参数个数区分错误中间件，必须是 4 个参数）
 */
// 结构化日志
const logger = require('../utils/logger');

/** 404：没有任何路由匹配时兜底 */
function notFound(req, res) {
  // 回显方法与原始路径，便于前端排查写错的接口
  res.status(404).json({ code: 404, message: `接口不存在: ${req.method} ${req.originalUrl}`, data: null });
}

/**
 * 统一错误兜底
 * 约定：控制器里抛出的错误可带 err.status 指定 HTTP 状态码，未指定按 500
 */
function errorHandler(err, req, res, next) {
  // 状态码优先级：err.status → err.statusCode → 500
  const status = err.status || err.statusCode || 500;
  // 5xx 才把错误对象（含栈）打进日志；4xx 是预期内的业务错误，只记消息
  logger.error('http', `${req.method} ${req.originalUrl} -> ${status}: ${err.message}`, status >= 500 ? err : undefined);

  // 响应已发出时只能交给 Express 默认处理
  if (res.headersSent) return next(err);

  const isProd = process.env.NODE_ENV === 'production';
  // 生产环境的 5xx 一律屏蔽内部细节，避免泄露表名/SQL
  const message = isProd && status >= 500 ? '服务器内部错误' : err.message || '服务器内部错误';

  // 与 success/fail 保持同样的响应结构
  res.status(status).json({ code: status, message, data: null });
}

// 导出：notFound 挂在路由末尾，errorHandler 再挂在它之后
module.exports = { notFound, errorHandler };
