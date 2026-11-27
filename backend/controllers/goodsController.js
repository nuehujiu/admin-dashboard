/**
 * 商品管理控制器
 * 接口契约与 userController 保持一致：
 *   - 成功 {code:0, message, data}
 *   - 参数类业务错误 HTTP 200 + code 1
 *   - 资源不存在 HTTP 404 + code 404
 */
// 查询助手
const { query } = require('../config/db');
// 统一响应
const { success, fail, paged } = require('../utils/response');

/**
 * 把价格转成两位小数的数字，非法返回 null
 * @param {*} v
 * @returns {number|null}
 */
function normalizePrice(v) {
  // 空值视为未填
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  // NaN / Infinity 负数都拒绝
  if (!Number.isFinite(n) || n < 0) return null;
  // 四舍五入到分，避免 19.999 存成 19.99 还是 20.00 的分歧
  return Math.round(n * 100) / 100;
}

/**
 * 状态只允许 0 / 1
 * @returns {0|1|null|false} null=未传（调用方可取默认值），false=非法值
 * 注意：这里用 false 区分「非法」，因为 0 是合法值
 */
function normalizeStatus(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (n !== 0 && n !== 1) return false;
  return n;
}

/** 分页列表，支持 keyword（名称/SKU）/ category / status 筛选 */
async function list(req, res, next) {
  try {
    // 分页参数限幅
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
    const { keyword, category, status } = req.query;

    // WHERE 片段收集
    const where = [];
    const params = [];

    if (keyword) {
      // 关键字同时匹配商品名与 SKU
      where.push('(name LIKE ? OR sku LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    // status 可能是 0，需单独判断空
    if (status !== undefined && status !== '') {
      where.push('status = ?');
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // 总数
    const countRows = await query(`SELECT COUNT(*) AS total FROM goods ${whereSql}`, params);
    const total = countRows[0].total;

    // 当前页：新建的在前
    const offset = (page - 1) * pageSize;
    const rows = await query(
      `SELECT id, name, sku, category, price, stock, sales, status, image, description, created_at, updated_at
       FROM goods ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // price 是 DECIMAL，原样返回字符串；前端页面自行 Number() 转
    return paged(res, { list: rows, total, page, pageSize });
  } catch (err) {
    next(err);
  }
}

/** 分类下拉选项（去重、按名称排序，裸数组） */
async function categories(req, res, next) {
  try {
    // 排除空分类，避免下拉出现空选项
    const rows = await query(
      "SELECT DISTINCT category FROM goods WHERE category <> '' ORDER BY category ASC"
    );
    // 返回纯字符串数组，前端直接当 options 用
    return success(res, rows.map((r) => r.category));
  } catch (err) {
    next(err);
  }
}

/** 详情 */
async function detail(req, res, next) {
  try {
    const rows = await query(
      `SELECT id, name, sku, category, price, stock, sales, status, image, description, created_at, updated_at
       FROM goods WHERE id = ?`,
      [req.params.id]
    );
    if (!rows.length) {
      return fail(res, '商品不存在', 404, 404);
    }
    return success(res, rows[0]);
  } catch (err) {
    next(err);
  }
}

/** 新增商品 */
async function create(req, res, next) {
  try {
    // 解构时给可选字段默认值，减少后续判空
    const {
      name,
      sku,
      category = '',
      price,
      stock = 0,
      sales = 0,
      status = 1,
      image = null,
      description = '',
    } = req.body || {};

    // 名称与 SKU 必填
    if (!name || !sku) {
      return fail(res, '商品名称和 SKU 为必填项');
    }
    // 价格必须合法
    const priceNum = normalizePrice(price);
    if (priceNum === null) {
      return fail(res, '价格必须为不小于 0 的数字');
    }
    // 状态校验（false 才是非法）
    const statusNum = normalizeStatus(status);
    if (statusNum === false) {
      return fail(res, 'status 只能为 0 或 1');
    }

    // SKU 唯一
    const exists = await query('SELECT id FROM goods WHERE sku = ?', [sku]);
    if (exists.length) {
      return fail(res, 'SKU 已存在');
    }

    // 库存/销量兜底为非负整数（Number() || 0 会把 NaN 归零）
    const result = await query(
      `INSERT INTO goods (name, sku, category, price, stock, sales, status, image, description)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        name,
        sku,
        category,
        priceNum,
        Math.max(0, Number(stock) || 0),
        Math.max(0, Number(sales) || 0),
        statusNum === null ? 1 : statusNum,
        image,
        description,
      ]
    );
    return success(res, { id: result.insertId }, '新增成功');
  } catch (err) {
    next(err);
  }
}

/** 编辑商品（只更新传了的字段） */
async function update(req, res, next) {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const { name, sku, category, price, stock, sales, status, image, description } = body;

    // 商品必须存在
    const exists = await query('SELECT id FROM goods WHERE id = ?', [id]);
    if (!exists.length) {
      return fail(res, '商品不存在', 404, 404);
    }

    // 名称不允许改成空串
    if (name !== undefined && !name) {
      return fail(res, '商品名称不能为空');
    }
    // 改 SKU 要保证不与其它商品冲突（排除自己）
    if (sku !== undefined) {
      if (!sku) return fail(res, 'SKU 不能为空');
      const dup = await query('SELECT id FROM goods WHERE sku = ? AND id <> ?', [sku, id]);
      if (dup.length) {
        return fail(res, 'SKU 已存在');
      }
    }

    // 动态 SET 片段
    const fields = [];
    const params = [];

    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (sku !== undefined) { fields.push('sku = ?'); params.push(sku); }
    if (category !== undefined) { fields.push('category = ?'); params.push(category); }
    if (price !== undefined) {
      const priceNum = normalizePrice(price);
      if (priceNum === null) return fail(res, '价格必须为不小于 0 的数字');
      fields.push('price = ?'); params.push(priceNum);
    }
    if (stock !== undefined) {
      const stockNum = Number(stock);
      if (!Number.isFinite(stockNum) || stockNum < 0) return fail(res, '库存必须为不小于 0 的数字');
      // 库存是整数，向下取整
      fields.push('stock = ?'); params.push(Math.floor(stockNum));
    }
    if (sales !== undefined) {
      const salesNum = Number(sales);
      if (!Number.isFinite(salesNum) || salesNum < 0) return fail(res, '销量必须为不小于 0 的数字');
      fields.push('sales = ?'); params.push(Math.floor(salesNum));
    }
    if (status !== undefined) {
      const statusNum = normalizeStatus(status);
      if (statusNum === null || statusNum === false) return fail(res, 'status 只能为 0 或 1');
      fields.push('status = ?'); params.push(statusNum);
    }
    if (image !== undefined) { fields.push('image = ?'); params.push(image); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description); }

    // 没有任何字段要改：报错而不是执行空 UPDATE
    if (!fields.length) {
      return fail(res, '没有可更新的字段');
    }

    params.push(id);
    await query(`UPDATE goods SET ${fields.join(', ')} WHERE id = ?`, params);
    return success(res, null, '更新成功');
  } catch (err) {
    next(err);
  }
}

/** 上下架 */
async function toggleStatus(req, res, next) {
  try {
    const id = req.params.id;
    // 校验状态（null=未传、false=非法，两者都不接受）
    const status = normalizeStatus((req.body || {}).status);
    if (status === null || status === false) {
      return fail(res, 'status 只能为 0 或 1');
    }

    const exists = await query('SELECT id FROM goods WHERE id = ?', [id]);
    if (!exists.length) {
      return fail(res, '商品不存在', 404, 404);
    }

    await query('UPDATE goods SET status = ? WHERE id = ?', [status, id]);
    return success(res, null, status === 1 ? '已上架' : '已下架');
  } catch (err) {
    next(err);
  }
}

/** 删除商品 */
async function remove(req, res, next) {
  try {
    const id = req.params.id;
    const exists = await query('SELECT id FROM goods WHERE id = ?', [id]);
    if (!exists.length) {
      return fail(res, '商品不存在', 404, 404);
    }
    await query('DELETE FROM goods WHERE id = ?', [id]);
    return success(res, null, '删除成功');
  } catch (err) {
    next(err);
  }
}

/**
 * 批量 ids 校验：非空数组、正整数、自动去重、最多 100 条
 * 返回 { ok: true, ids } 或 { ok: false, message }
 */
function normalizeIds(v, max = 100) {
  if (!Array.isArray(v) || !v.length) {
    return { ok: false, message: 'ids 必须是非空数组' };
  }
  // 去重
  const set = new Set();
  for (const item of v) {
    const n = Number(item);
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, message: 'ids 只能为正整数' };
    }
    set.add(n);
  }
  // 限制批量规模
  if (set.size > max) {
    return { ok: false, message: `一次最多操作 ${max} 件商品` };
  }
  return { ok: true, ids: [...set] };
}

/**
 * 批量上下架
 * PUT /api/goods/batch/status  { ids: number[], status: 0 | 1 }
 * 返回 { affected, missing }
 */
async function batchStatus(req, res, next) {
  try {
    const body = req.body || {};

    // 校验 ids
    const idsCheck = normalizeIds(body.ids);
    if (!idsCheck.ok) return fail(res, idsCheck.message);

    // 校验目标状态
    const statusNum = normalizeStatus(body.status);
    if (statusNum === null || statusNum === false) {
      return fail(res, 'status 只能为 0 或 1');
    }

    const { ids } = idsCheck;
    // 动态占位符
    const ph = ids.map(() => '?').join(',');

    // 先查存在的 id，用于算出 missing（已被删除的）
    const found = await query(`SELECT id FROM goods WHERE id IN (${ph})`, ids);
    const foundIds = found.map((r) => r.id);
    const missing = ids.filter((id) => !foundIds.includes(id));

    let affected = 0;
    if (foundIds.length) {
      const result = await query(
        `UPDATE goods SET status = ? WHERE id IN (${foundIds.map(() => '?').join(',')})`,
        [statusNum, ...foundIds]
      );
      affected = result.affectedRows || 0;
    }

    const verb = statusNum === 1 ? '上架' : '下架';
    return success(
      res,
      { affected, missing },
      affected > 0 ? `已${verb} ${affected} 件商品` : '没有可操作的商品'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * 批量删除
 * POST /api/goods/batch-delete  { ids: number[] }
 * 返回 { affected, missing }
 * 注意用 POST 而不是 DELETE：很多网关/客户端对带 body 的 DELETE 支持不一致
 */
async function batchDelete(req, res, next) {
  try {
    const idsCheck = normalizeIds((req.body || {}).ids);
    if (!idsCheck.ok) return fail(res, idsCheck.message);

    const { ids } = idsCheck;
    const ph = ids.map(() => '?').join(',');

    // 先确认哪些存在
    const found = await query(`SELECT id FROM goods WHERE id IN (${ph})`, ids);
    const foundIds = found.map((r) => r.id);
    const missing = ids.filter((id) => !foundIds.includes(id));

    let affected = 0;
    if (foundIds.length) {
      const result = await query(
        `DELETE FROM goods WHERE id IN (${foundIds.map(() => '?').join(',')})`,
        foundIds
      );
      affected = result.affectedRows || 0;
    }

    return success(
      res,
      { affected, missing },
      affected > 0 ? `已删除 ${affected} 件商品` : '没有可删除的商品'
    );
  } catch (err) {
    next(err);
  }
}

// 导出全部方法
module.exports = {
  list,
  categories,
  detail,
  create,
  update,
  toggleStatus,
  remove,
  batchStatus,
  batchDelete,
};
