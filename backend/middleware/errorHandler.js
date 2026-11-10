/**
 * 全局错误处理中间件
 */

/** 404 */
function notFound(req, res, next) {
  res.status(404).json({ code: 404, message: `接口不存在: ${req.method} ${req.originalUrl}`, data: null });
}

/** 统一错误兜底 */
function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).json({
    code: status,
    message: err.message || '服务器内部错误',
    data: null,
  });
}

module.exports = { notFound, errorHandler };
