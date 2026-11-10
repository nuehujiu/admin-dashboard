/**
 * 商品管理控制器
 * 接口契约与 userController 保持一致：
 *   - 成功 {code:0, message, data}
 *   - 参数类业务错误 HTTP 200 + code 1
 *   - 资源不存在 HTTP 404 + code 404
 */
const { query } = require('../config/db');
const { success, fail, paged } = require('../utils/response');

/** 把价格转成两位小数的数字，非法返回 null */
function normalizePrice(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** 状态只允许 0 / 1 */
function normalizeStatus(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (n !== 0 && n !== 1) return false;
  return n;
}

/** 分页列表，支持 keyword（名称/SKU）/ category / status 筛选 */
async function list(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
    const { keyword, category, status } = req.query;

    const where = [];
    const params = [];

    if (keyword) {
      where.push('(name LIKE ? OR sku LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (status !== undefined && status !== '') {
      where.push('status = ?');
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRows = await query(`SELECT COUNT(*) AS total FROM goods ${whereSql}`, params);
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const rows = await query(
      `SELECT id, name, sku, category, price, stock, sales, status, image, description, created_at, updated_at
       FROM goods ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return paged(res, { list: rows, total, page, pageSize });
  } catch (err) {
    next(err);
  }
}

/** 分类下拉选项（去重、按名称排序，裸数组） */
async function categories(req, res, next) {
  try {
    const rows = await query(
      "SELECT DISTINCT category FROM goods WHERE category <> '' ORDER BY category ASC"
    );
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

    if (!name || !sku) {
      return fail(res, '商品名称和 SKU 为必填项');
    }
    const priceNum = normalizePrice(price);
    if (priceNum === null) {
      return fail(res, '价格必须为不小于 0 的数字');
    }
    const statusNum = normalizeStatus(status);
    if (statusNum === false) {
      return fail(res, 'status 只能为 0 或 1');
    }

    const exists = await query('SELECT id FROM goods WHERE sku = ?', [sku]);
    if (exists.length) {
      return fail(res, 'SKU 已存在');
    }

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

    const exists = await query('SELECT id FROM goods WHERE id = ?', [id]);
    if (!exists.length) {
      return fail(res, '商品不存在', 404, 404);
    }

    if (name !== undefined && !name) {
      return fail(res, '商品名称不能为空');
    }
    if (sku !== undefined) {
      if (!sku) return fail(res, 'SKU 不能为空');
      const dup = await query('SELECT id FROM goods WHERE sku = ? AND id <> ?', [sku, id]);
      if (dup.length) {
        return fail(res, 'SKU 已存在');
      }
    }

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

module.exports = { list, categories, detail, create, update, toggleStatus, remove };
