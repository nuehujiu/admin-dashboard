/**
 * 全局错误处理中间件
 * 生产环境只回固定文案，内部细节（SQL 报错、字段名、库名）只进日志
 */
const logger = require('../utils/logger');

/** 404 */
function notFound(req, res) {
  res.status(404).json({ code: 404, message: `接口不存在: ${req.method} ${req.originalUrl}`, data: null });
}

/** 统一错误兜底 */
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  logger.error('http', `${req.method} ${req.originalUrl} -> ${status}: ${err.message}`, status >= 500 ? err : undefined);

  // 响应已发出时只能交给 Express 默认处理
  if (res.headersSent) return next(err);

  const isProd = process.env.NODE_ENV === 'production';
  const message = isProd && status >= 500 ? '服务器内部错误' : err.message || '服务器内部错误';

  res.status(status).json({ code: status, message, data: null });
}

module.exports = { notFound, errorHandler };
