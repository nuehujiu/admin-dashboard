/**
 * 数据看板控制器：概览卡片、趋势、分类占比、排行
 * 数据源：sales（销售明细）+ categories（分类）+ users（用户数）
 * 注意：所有 SUM 都用 IFNULL 兜底为 0，避免空表返回 NULL
 */
// 查询助手
const { query } = require('../config/db');
// 统一响应
const { success, fail } = require('../utils/response');

/** 本地时区的 YYYY-MM-DD（直接 toISOString 会按 UTC 算，东八区 0~8 点会把「今天」算成昨天） */
function localDateStr(ts = Date.now()) {
  const d = new Date(ts);
  // 减去时区偏移量：把「本地时间」伪装成 UTC，再取 ISO 前 10 位即为本地日期
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** 概览卡片：今日销售额/销量/订单数、累计销售额、用户数，含环比 */
async function overview(req, res, next) {
  try {
    // 今日与昨日日期字符串
    const today = localDateStr();
    const yesterday = localDateStr(Date.now() - 86400000);

    // 今日与昨日销售（并行查询减少等待）
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

    /**
     * 环比计算：((当前 - 上期) / 上期) * 100，保留两位
     * 上期为 0 时返回 0（无基数可比，避免除零得 Infinity）
     */
    const calcChange = (cur, prev) =>
      prev > 0 ? Number((((cur - prev) / prev) * 100).toFixed(2)) : 0;

    // DECIMAL 字段经驱动返回字符串，统一 Number() 转数字给前端
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
    // 天数限制 1~90，防一次拉太多
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    // 起始日期 = 今天往前 (days-1) 天，保证返回正好 days 个点
    const start = localDateStr(Date.now() - (days - 1) * 86400000);

    const rows = await query(
      `SELECT sale_date AS date, IFNULL(SUM(amount),0) AS amount, IFNULL(SUM(qty),0) AS qty
       FROM sales WHERE sale_date >= ?
       GROUP BY sale_date ORDER BY sale_date`,
      [start]
    );

    // 补齐缺失日期，保证前端画图连续
    // 用 Map 建 date → row 索引，循环时按日期回查
    const map = new Map(rows.map((r) => [r.date, r]));
    const result = [];
    for (let i = 0; i < days; i++) {
      // 从最早一天开始逐日推进，顺序与 x 轴一致
      const d = localDateStr(Date.now() - (days - 1 - i) * 86400000);
      const row = map.get(d);
      // 当天无销售记录时补 0
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
    // 按金额降序，前端饼图图例顺序即重要性顺序
    return success(res, rows.map((r) => ({ name: r.name, value: Number(r.value) })));
  } catch (err) {
    next(err);
  }
}

/** 销售排行：分类 TOP N（默认 5） */
async function rank(req, res, next) {
  try {
    // TOP N 限制 1~20
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

// 导出四个看板接口
module.exports = { overview, trend, categoryRatio, rank };
