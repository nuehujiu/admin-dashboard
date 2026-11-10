/**
 * 数据看板控制器：概览卡片、趋势、分类占比、排行
 */
const { query } = require('../config/db');
const { success, fail } = require('../utils/response');

/** 概览卡片：今日销售额/销量/订单数、累计销售额、用户数，含环比 */
async function overview(req, res, next) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // 今日与昨日销售
    const [todaySales, yesterdaySales] = await Promise.all([
      query('SELECT IFNULL(SUM(amount),0) AS amount, IFNULL(SUM(qty),0) AS qty FROM sales WHERE sale_date = ?', [today]),
      query('SELECT IFNULL(SUM(amount),0) AS amount, IFNULL(SUM(qty),0) AS qty FROM sales WHERE sale_date = ?', [yesterday]),
    ]);

    // 累计销售额、累计销量、用户总数、销售记录数
    const [total, userCount, recordCount] = await Promise.all([
      query('SELECT IFNULL(SUM(amount),0) AS amount, IFNULL(SUM(qty),0) AS qty FROM sales'),
      query('SELECT COUNT(*) AS c FROM users'),
      query('SELECT COUNT(*) AS c FROM sales'),
    ]);

    const calcChange = (cur, prev) =>
      prev > 0 ? Number((((cur - prev) / prev) * 100).toFixed(2)) : 0;

    return success(res, {
      today_amount: Number(todaySales[0].amount),
      today_amount_change: calcChange(Number(todaySales[0].amount), Number(yesterdaySales[0].amount)),
      today_qty: Number(todaySales[0].qty),
      total_amount: Number(total[0].amount),
      total_qty: Number(total[0].qty),
      user_count: userCount[0].c,
      record_count: recordCount[0].c,
    });
  } catch (err) {
    next(err);
  }
}

/** 销售趋势：最近 N 天按日汇总（默认 30 天） */
async function trend(req, res, next) {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const start = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);

    const rows = await query(
      `SELECT sale_date AS date, IFNULL(SUM(amount),0) AS amount, IFNULL(SUM(qty),0) AS qty
       FROM sales WHERE sale_date >= ?
       GROUP BY sale_date ORDER BY sale_date`,
      [start]
    );

    // 补齐缺失日期，保证前端画图连续
    const map = new Map(rows.map((r) => [r.date, r]));
    const result = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
      const row = map.get(d);
      result.push({ date: d, amount: row ? Number(row.amount) : 0, qty: row ? Number(row.qty) : 0 });
    }

    return success(res, result);
  } catch (err) {
    next(err);
  }
}

/** 分类销售占比（饼图） */
async function categoryRatio(req, res, next) {
  try {
    const rows = await query(
      `SELECT c.name, IFNULL(SUM(s.amount),0) AS value
       FROM sales s
       JOIN categories c ON c.id = s.category_id
       GROUP BY c.id, c.name ORDER BY value DESC`
    );
    return success(res, rows.map((r) => ({ name: r.name, value: Number(r.value) })));
  } catch (err) {
    next(err);
  }
}

/** 销售排行：分类 TOP N（默认 5） */
async function rank(req, res, next) {
  try {
    const top = Math.min(20, Math.max(1, Number(req.query.top) || 5));
    const rows = await query(
      `SELECT c.id, c.name, IFNULL(SUM(s.amount),0) AS amount, IFNULL(SUM(s.qty),0) AS qty
       FROM sales s
       JOIN categories c ON c.id = s.category_id
       GROUP BY c.id, c.name ORDER BY amount DESC LIMIT ?`,
      [top]
    );
    return success(res, rows.map((r) => ({ ...r, amount: Number(r.amount), qty: Number(r.qty) })));
  } catch (err) {
    next(err);
  }
}

module.exports = { overview, trend, categoryRatio, rank };
