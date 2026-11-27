/**
 * 统一响应格式工具
 * 约定：{ code, message, data }
 *  code === 0  表示成功；非 0 表示失败
 * 前端 axios 拦截器据此解包：code 为 0 时直接拿 data，否则 reject 出 message
 */

/** 成功响应 */
function success(res, data = null, message = 'ok') {
  // HTTP 状态固定 200，业务状态交给 code
  return res.json({ code: 0, message, data });
}

/** 失败响应（业务错误，如参数不合法、未找到） */
function fail(res, message = '请求失败', httpStatus = 200, code = 1) {
  // 默认 HTTP 200 + code 1：让前端能读到 message 而不是被网络层吞掉
  // 需要语义化状态码时（如 401 / 404 / 429）由调用方显式传入
  return res.status(httpStatus).json({ code, message, data: null });
}

/** 分页响应 */
function paged(res, { list, total, page, pageSize }) {
  // 统一字段名，前端表格直接消费 list / total
  return res.json({
    code: 0,
    message: 'ok',
    data: {
      list,
      // 总数用于算页数
      total,
      // 回显分页参数：查询串可能传的是字符串，这里统一转数字
      page: Number(page),
      pageSize: Number(pageSize),
    },
  });
}

// 三个响应助手
module.exports = { success, fail, paged };
