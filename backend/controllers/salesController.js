/**
 * 销售明细控制器
 * 数据源：sales（日期 × 分类 汇总表）+ categories
 * 契约与 goodsController 保持一致：
 *   - 成功 { code:0, message, data }
 *   - 参数类业务错误 HTTP 200 + code 1
 */
const { query } = require('../config/db');
const { success, fail, paged } = require('../utils/response');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 分页列表，支持 start / end / category_id 筛选 */
async function list(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
    const { start, end, category_id } = req.query;

    if (start && !DATE_RE.test(start)) return fail(res, 'start 需为 YYYY-MM-DD 格式');
    if (end && !DATE_RE.test(end)) return fail(res, 'end 需为 YYYY-MM-DD 格式');
    if (start && end && start > end) return fail(res, 'start 不能晚于 end');

    const where = [];
    const params = [];

    if (start) {
      where.push('s.sale_date >= ?');
      params.push(start);
    }
    if (end) {
      where.push('s.sale_date <= ?');
      params.push(end);
    }
    if (category_id !== undefined && category_id !== '') {
      const cid = Number(category_id);
      if (!Number.isInteger(cid) || cid <= 0) return fail(res, 'category_id 需为正整数');
      where.push('s.category_id = ?');
      params.push(cid);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRows = await query(`SELECT COUNT(*) AS total FROM sales s ${whereSql}`, params);
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const rows = await query(
      `SELECT s.id, s.category_id, c.name AS category_name,
              s.amount, s.qty, s.order_count, s.refund_amount, s.sale_date
       FROM sales s
       JOIN categories c ON c.id = s.category_id
       ${whereSql}
       ORDER BY s.sale_date DESC, s.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // DECIMAL 在 mysql2 里是字符串，统一转数字
    return paged(res, {
      list: rows.map((r) => ({
        id: r.id,
        category_id: r.category_id,
        category_name: r.category_name,
        amount: Number(r.amount),
        qty: Number(r.qty),
        order_count: Number(r.order_count),
        refund_amount: Number(r.refund_amount),
        sale_date: r.sale_date, // dateStrings:true → 已是 'YYYY-MM-DD'
      })),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    next(err);
  }
}

/** 本地日期 YYYY-MM-DD（不用 toISOString，避免 UTC 偏一天） */
function localDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 以今天为基准加减 n 天（始终按本地日历算） */
function shiftDays(n) {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate() + n);
}

/** 相对变化率；上期为 0 时返回 null，前端显示「—」 */
function relative(cur, prev) {
  if (!prev) return null;
  return Number(((cur - prev) / prev).toFixed(4));
}

/**
 * 销售统计整页数据（对齐 UI 设计稿）
 *   GET /api/sales/stats?days=30
 * 一次返回：4 个 KPI + 环比、逐日趋势（补零）、品类占比（本期内）
 */
async function stats(req, res, next) {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));

    const start = localDate(shiftDays(-(days - 1)));
    const end = localDate(shiftDays(0));
    const prevStart = localDate(shiftDays(-(days * 2 - 1)));
    const prevEnd = localDate(shiftDays(-days));

    // ---------- 本期逐日 ----------
    const dayRows = await query(
      `SELECT s.sale_date AS date,
              SUM(s.amount)        AS amount,
              SUM(s.qty)           AS qty,
              SUM(s.order_count)   AS order_count,
              SUM(s.refund_amount) AS refund_amount
         FROM sales s
        WHERE s.sale_date BETWEEN ? AND ?
        GROUP BY s.sale_date
        ORDER BY s.sale_date`,
      [start, end]
    );
    const dayMap = new Map(dayRows.map((r) => [r.date, r]));

    // 逐日补零，保证柱状图连续（缺数据的日期 amount 为 0）
    const base = new Date(`${start}T00:00:00`);
    const trend = [];
    for (let i = 0; i < days; i++) {
      const ds = localDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i));
      const r = dayMap.get(ds);
      trend.push({
        date: ds,
        amount: r ? Number(r.amount) : 0,
        qty: r ? Number(r.qty) : 0,
        order_count: r ? Number(r.order_count) : 0,
        refund_amount: r ? Number(r.refund_amount) : 0,
      });
    }

    // ---------- 本期汇总 ----------
    const cur = trend.reduce(
      (a, t) => ({
        amount: a.amount + t.amount,
        qty: a.qty + t.qty,
        orderCount: a.orderCount + t.order_count,
        refundAmount: a.refundAmount + t.refund_amount,
      }),
      { amount: 0, qty: 0, orderCount: 0, refundAmount: 0 }
    );

    // ---------- 上期汇总（环比基准）----------
    const prevRows = await query(
      `SELECT SUM(amount) AS amount, SUM(qty) AS qty,
              SUM(order_count) AS order_count, SUM(refund_amount) AS refund_amount
         FROM sales
        WHERE sale_date BETWEEN ? AND ?`,
      [prevStart, prevEnd]
    );
    const p = prevRows[0];
    const prev = {
      amount: Number(p.amount || 0),
      qty: Number(p.qty || 0),
      orderCount: Number(p.order_count || 0),
      refundAmount: Number(p.refund_amount || 0),
    };

    const avgOrderValue = cur.orderCount > 0 ? cur.amount / cur.orderCount : 0;
    const prevAvgOrderValue = prev.orderCount > 0 ? prev.amount / prev.orderCount : 0;
    const refundRate = cur.amount > 0 ? cur.refundAmount / cur.amount : 0;
    const prevRefundRate = prev.amount > 0 ? prev.refundAmount / prev.amount : 0;

    // ---------- 品类占比（本期内）----------
    const catRows = await query(
      `SELECT c.id, c.name,
              SUM(s.amount)      AS amount,
              SUM(s.order_count) AS order_count
         FROM sales s
         JOIN categories c ON c.id = s.category_id
        WHERE s.sale_date BETWEEN ? AND ?
        GROUP BY c.id, c.name
        ORDER BY amount DESC`,
      [start, end]
    );
    const catTotal = catRows.reduce((a, r) => a + Number(r.amount), 0);

    return success(res, {
      range: { days, start, end, prevStart, prevEnd },
      kpi: {
        amount: Number(cur.amount.toFixed(2)),
        orderCount: cur.orderCount,
        avgOrderValue: Number(avgOrderValue.toFixed(2)),
        refundRate: Number(refundRate.toFixed(4)),
        qty: cur.qty,
        // 前三项是相对变化率；refundRate 是百分点差（-0.004 表示下降 0.4 个百分点）
        compare: {
          amount: relative(cur.amount, prev.amount),
          orderCount: relative(cur.orderCount, prev.orderCount),
          avgOrderValue: relative(avgOrderValue, prevAvgOrderValue),
          refundRate: prev.amount > 0 ? Number((refundRate - prevRefundRate).toFixed(4)) : null,
        },
      },
      trend,
      categories: catRows.map((r) => ({
        id: r.id,
        name: r.name,
        amount: Number(r.amount),
        orderCount: Number(r.order_count),
        pct: catTotal > 0 ? Number((Number(r.amount) / catTotal).toFixed(4)) : 0,
      })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, stats };
