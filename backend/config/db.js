/**
 * MySQL 连接池配置（基于 mysql2/promise）
 */
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'admin_dashboard',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true, // 让 DATE/DATETIME 直接返回字符串，避免时区与序列化问题
});

/** 测试数据库连接是否可用 */
async function connectDB() {
  await pool.query('SELECT 1');
  console.log('[db] MySQL 连接池已就绪');
  return pool;
}

/** 通用查询助手：直接返回 rows */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = { pool, connectDB, query };
