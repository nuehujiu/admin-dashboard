/**
 * 统一响应格式工具
 * 约定：{ code, message, data }
 *  code === 0  表示成功；非 0 表示失败
 */

/** 成功响应 */
function success(res, data = null, message = 'ok') {
  return res.json({ code: 0, message, data });
}

/** 失败响应（业务错误，如参数不合法、未找到） */
function fail(res, message = '请求失败', httpStatus = 200, code = 1) {
  return res.status(httpStatus).json({ code, message, data: null });
}

/** 分页响应 */
function paged(res, { list, total, page, pageSize }) {
  return res.json({
    code: 0,
    message: 'ok',
    data: {
      list,
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    },
  });
}

module.exports = { success, fail, paged };
