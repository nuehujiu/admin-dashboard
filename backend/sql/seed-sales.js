/**
 * 补齐 sales 演示数据到「今天」
 * 用法：node sql/seed-sales.js   （可重复执行，只补缺失日期，不动其他表）
 *
 * 场景：npm run init-db 是在某一天跑的，sales 只覆盖到那天；
 * 之后「近 7 天」之类的时间筛选就会查不到数据。
 */
// 指定 .env 路径
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
// 复用应用侧的连接池与查询助手（配置与业务代码完全一致）
const { query, pool } = require('../config/db');

/** 本地日期 YYYY-MM-DD（不用 toISOString，避免 UTC 偏一天） */
function localDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 主流程 */
async function run() {
  // 先确认分类存在，否则插进去的销售记录关联不到分类
  const cats = await query('SELECT id FROM categories ORDER BY id');
  if (!cats.length) {
    console.log('[seed] categories 为空，请先执行 npm run init-db');
    return;
  }

  // 当前库里最新一条销售日期
  const rows = await query('SELECT MAX(sale_date) AS maxDate FROM sales');
  // 今天（本地）
  const today = localDate(new Date());

  let from;
  if (!rows[0].maxDate) {
    // 表是空的：补最近 30 天
    from = localDate(new Date(Date.now() - 29 * 86400000));
  } else {
    // 从最后一天的次日开始
    from = localDate(new Date(new Date(`${rows[0].maxDate}T00:00:00`).getTime() + 86400000));
  }

  // 已经补到今天之后就不做任何事（幂等）
  if (from > today) {
    console.log(`[seed] 数据已到 ${rows[0].maxDate}，无需补齐`);
    return;
  }

  // 统计：补了几天、插了几条
  let added = 0;
  let days = 0;
  // 以毫秒步进逐日推进（跨月跨年由 Date 自动进位）
  for (let t = new Date(`${from}T00:00:00`); localDate(t) <= today; t = new Date(t.getTime() + 86400000)) {
    const ds = localDate(t);
    // 当天已有数据则跳过，避免重复插入
    const existed = await query('SELECT COUNT(*) AS c FROM sales WHERE sale_date = ?', [ds]);
    if (existed[0].c > 0) continue;
    days++;
    // 当天每个分类各插一条
    for (const c of cats) {
      // 金额 500~8500，保留两位
      const amount = (Math.random() * 8000 + 500).toFixed(2);
      // 订单数 8~52
      const orderCount = Math.floor(Math.random() * 45) + 8;
      // 销量 = 订单数 + 0~39 的额外件数
      const qty = orderCount + Math.floor(Math.random() * 40);
      // 退款金额：金额的 0~3.5%
      const refundAmount = (Number(amount) * Math.random() * 0.035).toFixed(2);
      await query(
        'INSERT INTO sales (category_id, amount, qty, order_count, refund_amount, sale_date) VALUES (?,?,?,?,?,?)',
        [c.id, amount, qty, orderCount, refundAmount, ds]
      );
      added++;
    }
  }

  // 收尾统计，便于人工核对
  const total = await query('SELECT COUNT(*) AS c FROM sales');
  console.log(`[seed] 补齐 ${days} 天 / ${added} 条，sales 现有 ${total[0].c} 条，最新日期 ${today}`);
}

// 无论成功失败都要关池，否则进程挂住不退出
run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('[seed] 失败:', err.message);
    await pool.end();
    process.exit(1);
  });
