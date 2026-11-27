/**
 * MySQL 连接池配置（基于 mysql2/promise）
 * 说明：
 *   - 用「连接池」而不是单连接，避免并发请求互相等待，也免去手写重连逻辑
 *   - 所有配置项都支持环境变量覆盖，默认值面向本地开发
 */
// 引入 mysql2 的 Promise 版 API，可直接 await 查询结果
const mysql = require('mysql2/promise');

// 创建全局连接池（整个进程共用，随进程退出自动释放）
const pool = mysql.createPool({
  // 数据库地址，默认本机
  host: process.env.DB_HOST || '127.0.0.1',
  // 端口：环境变量是字符串，用 Number() 转成数字
  port: Number(process.env.DB_PORT) || 3306,
  // 账号
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  // 库名：需与 sql/init.js 中创建的一致
  database: process.env.DB_NAME || 'admin_dashboard',
  // 连接耗尽时让请求排队等待，而不是直接报错
  waitForConnections: true,
  // 池内最大连接数：本地练习项目 10 已足够
  connectionLimit: 10,
  // 排队上限 0 = 不限制
  queueLimit: 0,
  dateStrings: true, // 让 DATE/DATETIME 直接返回字符串，避免时区与序列化问题
});

/** 测试数据库连接是否可用 */
async function connectDB() {
  // 最轻量的探测 SQL，能连通就说明账号、库名、网络都正常
  await pool.query('SELECT 1');
  console.log('[db] MySQL 连接池已就绪');
  return pool;
}

/** 通用查询助手：直接返回 rows */
async function query(sql, params = []) {
  // mysql2 返回 [rows, fields]，这里只关心 rows
  const [rows] = await pool.query(sql, params);
  return rows;
}

// 导出池对象（需要事务时使用）与两个封装好的助手
module.exports = { pool, connectDB, query };
